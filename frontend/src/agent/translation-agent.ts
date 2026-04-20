/**
 * Translation Agent — converts natural language to DiagramJSON using OpenAI.
 *
 * Flow:
 *   1. Retrieve top-3 relevant training examples
 *   2. Call OpenAI gpt-4o-mini with JSON mode
 *   3. Parse + validate the response (structural)
 *   4. If parse fails, retry once with stricter instructions
 *   5. Run semantic validator; if issues found, retry with issues injected
 *   6. Return DiagramJSON
 */

import type { DiagramJSON } from '../types'
import { buildSystemPrompt, buildUserPrompt } from './prompts'
import { trainingStore } from './training-store'
import { validateDiagram } from './diagram-validator'
import type { ValidationIssue } from './diagram-validator'
import { getRegistrySchema, getAllPlugins } from '../plugins'

// ─── Public API ───────────────────────────────────────────────────────────────

export interface TranslationResult {
  ok:      true
  diagram: DiagramJSON
  source:  'openai'
}

export interface TranslationError {
  ok:    false
  error: string
}

export async function translate(
  description: string
): Promise<TranslationResult | TranslationError> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
  if (!apiKey) {
    return { ok: false, error: 'No OpenAI API key. Set VITE_OPENAI_API_KEY in .env.local' }
  }

  const registry     = getRegistrySchema()
  const systemPrompt = buildSystemPrompt(registry)
  const examples     = trainingStore.selectRelevant(description, 3)
  const userPrompt   = buildUserPrompt(description, examples)

  // Attempt 1
  const result1 = await callOpenAI(systemPrompt, userPrompt, apiKey)
  if (result1.ok) {
    const parsed = parseAndValidate(result1.text)
    if (parsed.ok) {
      const validated = await runSemanticValidation(parsed.diagram, userPrompt, systemPrompt, apiKey)
      if (validated) return validated
    }
  }

  // Attempt 2 — stricter prompt
  const result2 = await callOpenAI(
    systemPrompt,
    userPrompt + '\n\nIMPORTANT: Respond with ONLY the raw JSON object. No extra text.',
    apiKey,
  )
  if (result2.ok) {
    const parsed = parseAndValidate(result2.text)
    if (parsed.ok) {
      const validated = await runSemanticValidation(parsed.diagram, userPrompt, systemPrompt, apiKey)
      if (validated) return validated
    }
  }

  return { ok: false, error: result2.ok ? 'Could not parse valid DiagramJSON from OpenAI response' : result2.error }
}

// ─── Semantic validation + correction loop ────────────────────────────────────

async function runSemanticValidation(
  diagram: DiagramJSON,
  originalPrompt: string,
  systemPrompt: string,
  apiKey: string,
): Promise<TranslationResult | null> {
  const validation = await validateDiagram(diagram)
  if (validation.ok) return { ok: true, diagram, source: 'openai' }

  const correctionPrompt = buildCorrectionPrompt(originalPrompt, validation.issues)
  const corrected = await callOpenAI(systemPrompt, correctionPrompt, apiKey)
  if (corrected.ok) {
    const parsed = parseAndValidate(corrected.text)
    if (parsed.ok) return { ok: true, diagram: parsed.diagram, source: 'openai' }
  }

  console.warn('[translation-agent] semantic correction failed; using original', validation.issues)
  return { ok: true, diagram, source: 'openai' }
}

function buildCorrectionPrompt(originalPrompt: string, issues: ValidationIssue[]): string {
  const issueLines = issues
    .map((iss, i) => {
      const ids = iss.affected_ids.length > 0 ? ` (components: ${iss.affected_ids.join(', ')})` : ''
      return `${i + 1}. [${iss.type}] ${iss.description}${ids}`
    })
    .join('\n')

  return (
    originalPrompt +
    `\n\nThe previous diagram had the following issues that must be fixed:\n${issueLines}\n\n` +
    `Generate a corrected DiagramJSON that resolves all issues. Respond with ONLY the raw JSON object.`
  )
}

// ─── OpenAI call ─────────────────────────────────────────────────────────────

async function callOpenAI(
  systemPrompt: string,
  userContent: string,
  apiKey: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:           'gpt-4o',
        max_tokens:      8192,
        temperature:     0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userContent },
        ],
      }),
    })

    if (!res.ok) {
      return { ok: false, error: `OpenAI HTTP ${res.status}: ${await res.text()}` }
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const text = data.choices?.[0]?.message?.content ?? ''
    return { ok: true, text }
  } catch (err) {
    return { ok: false, error: `OpenAI unreachable: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ─── Parse + validate ─────────────────────────────────────────────────────────

function parseAndValidate(
  raw: string
): { ok: true; diagram: DiagramJSON } | { ok: false; error: string } {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()

  let obj: unknown
  try {
    obj = JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return { ok: false, error: 'No JSON object found in response' }
    try {
      obj = JSON.parse(match[0])
    } catch (e) {
      return { ok: false, error: `JSON parse error: ${e}` }
    }
  }

  if (!obj || typeof obj !== 'object') {
    return { ok: false, error: 'Response is not a JSON object' }
  }

  const d = obj as Record<string, unknown>
  if (!Array.isArray(d['components'])) {
    return { ok: false, error: 'Missing components array' }
  }

  if (!d['diagramai_version']) d['diagramai_version'] = '0.1'
  if (!d['diagram_style'])     d['diagram_style']     = 'clean'

  const components = d['components'] as Array<Record<string, unknown>>
  const knownTypes = new Set(getAllPlugins().map(p => p.name))

  d['components'] = components.map(c => {
    const t = c['type'] as string | undefined
    if (t && !knownTypes.has(t)) {
      console.warn(`[translation-agent] unknown type "${t}" — remapped to "process-box"`)
      return { ...c, type: 'process-box' }
    }
    return c
  })

  // Deduplicate arrows with same from→to
  const seenEdges = new Set<string>()
  d['components'] = (d['components'] as Array<Record<string, unknown>>).filter(c => {
    if (c['type'] !== 'arrow') return true
    const props = c['props'] as Record<string, unknown> | undefined
    const key = `${props?.['from']}→${props?.['to']}`
    if (seenEdges.has(key)) return false
    seenEdges.add(key)
    return true
  })

  return { ok: true, diagram: d as unknown as DiagramJSON }
}
