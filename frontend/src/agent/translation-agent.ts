/**
 * Translation Agent — converts natural language to Mermaid syntax using OpenAI.
 *
 * Flow:
 *   1. Select top-3 relevant training examples
 *   2. Call OpenAI gpt-4o with the Mermaid system prompt
 *   3. Return the Mermaid syntax string
 *   4. On parse failure, retry once with a stricter instruction
 */

import { buildSystemPrompt, buildUserPrompt } from './prompts'
import { trainingStore } from './training-store'

// ─── Public API ───────────────────────────────────────────────────────────────

export interface TranslationResult {
  ok:     true
  syntax: string
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

  const examples    = trainingStore.selectRelevant(description, 3)
  const systemPrompt = buildSystemPrompt()
  const userPrompt   = buildUserPrompt(description, examples)

  // Attempt 1
  const result1 = await callOpenAI(systemPrompt, userPrompt, apiKey)
  if (result1.ok) {
    const syntax = extractSyntax(result1.text)
    if (syntax) return { ok: true, syntax }
  }

  // Attempt 2 — stricter
  const result2 = await callOpenAI(
    systemPrompt,
    userPrompt + '\n\nIMPORTANT: Output ONLY the raw Mermaid syntax. No markdown fences, no explanation.',
    apiKey,
  )
  if (result2.ok) {
    const syntax = extractSyntax(result2.text)
    if (syntax) return { ok: true, syntax }
  }

  return {
    ok: false,
    error: result2.ok
      ? 'Could not extract valid Mermaid syntax from the response'
      : result2.error,
  }
}

// ─── Extract Mermaid syntax from response ────────────────────────────────────

function extractSyntax(raw: string): string | null {
  // Strip markdown code fences if present
  const stripped = raw
    .replace(/^```(?:mermaid)?\s*/im, '')
    .replace(/```\s*$/m, '')
    .trim()

  // Must start with a known Mermaid diagram type
  const first = stripped.split('\n')[0].trim().toLowerCase()
  const known = ['flowchart', 'graph ', 'architecture-beta', 'sequencediagram', 'classDiagram', 'erDiagram']
  if (known.some(k => first.startsWith(k.toLowerCase()))) {
    return stripped
  }

  return null
}

// ─── OpenAI call ─────────────────────────────────────────────────────────────

async function callOpenAI(
  systemPrompt: string,
  userContent:  string,
  apiKey:       string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       'gpt-4o',
        max_tokens:  4096,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userContent  },
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
