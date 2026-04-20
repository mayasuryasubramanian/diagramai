/**
 * Diagram Semantic Validator
 *
 * A second-pass LLM check that runs after structural parsing succeeds.
 * Catches problems parseAndValidate cannot see:
 *
 *   duplicate_relation   — two arrows expressing the same relationship
 *                          (may have different IDs or labels but same meaning)
 *   conflicting_relation — arrows that contradict each other
 *                          (e.g. A→B and B→A both present when only one makes sense,
 *                           or the same node playing incompatible roles)
 *   meaningless_spec     — structurally valid but semantically nonsensical
 *                          (e.g. CDN connected directly to a database,
 *                           a mobile app writing to a message queue,
 *                           a start node with incoming arrows)
 *
 * Uses the same LLM infrastructure as the translation agent (Ollama primary,
 * Anthropic fallback). The validator model does NOT generate a full diagram —
 * it only outputs a small JSON verdict, so it is fast (~3–5 s with think:false).
 */

import type { DiagramJSON } from '../types'

// ─── Public types ─────────────────────────────────────────────────────────────

export type IssueType =
  | 'duplicate_relation'
  | 'conflicting_relation'
  | 'meaningless_spec'

export interface ValidationIssue {
  type:         IssueType
  description:  string          // plain English, readable by translator on retry
  affected_ids: string[]        // component IDs involved
}

export type DiagramValidationResult =
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] }

// ─── Constants ────────────────────────────────────────────────────────────────

const OLLAMA_URL   = 'http://localhost:11434/api/chat'
const OLLAMA_MODEL = 'qwen3:8b'

const VALIDATOR_SYSTEM_PROMPT = `You are a diagram structure validator. You receive a DiagramJSON and identify semantic problems.

Check for exactly three categories of issues:

1. duplicate_relation
   Two arrows connect the same source and target and express the same relationship,
   even if they have different IDs or slightly different labels.
   Example: arrow-01 (api-gw → auth-svc, "verify") and arrow-07 (api-gw → auth-svc, "authenticate")

2. conflicting_relation
   Arrows that contradict each other or assign incompatible roles to a component.
   Example: A→B "sends data" and B→A "sends data" when only one direction makes sense.
   Example: a "CDN" node that also appears as a target of a database write arrow.

3. meaningless_spec
   A connection that is architecturally nonsensical given the component types and labels.
   Example: a mobile app writing directly to a message queue without a backend service.
   Example: a start node with incoming arrows.
   Example: an isolated node with no connections in a flow diagram.

Only report real problems. Do not invent issues. If the diagram looks correct, return valid:true.

Respond with ONLY a JSON object — no explanation, no markdown:

If no issues:
{"valid": true}

If issues found:
{"valid": false, "issues": [{"type": "duplicate_relation | conflicting_relation | meaningless_spec", "description": "one sentence", "affected_ids": ["id1", "id2"]}]}`

// ─── Public entry point ───────────────────────────────────────────────────────

export async function validateDiagram(
  diagram: DiagramJSON
): Promise<DiagramValidationResult> {
  const diagramJson = JSON.stringify(diagram, null, 2)

  // Try local Ollama first
  const local = await callValidator(diagramJson, false)
  if (local.ok) {
    const parsed = parseValidatorResponse(local.text)
    if (parsed !== null) return parsed
  }

  // Retry once with temperature 0 for more deterministic output
  const retry = await callValidator(diagramJson, true)
  if (retry.ok) {
    const parsed = parseValidatorResponse(retry.text)
    if (parsed !== null) return parsed
  }

  // Anthropic fallback
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined
  if (apiKey) {
    const fallback = await callValidatorAnthropic(diagramJson, apiKey)
    if (fallback.ok) {
      const parsed = parseValidatorResponse(fallback.text)
      if (parsed !== null) return parsed
    }
  }

  // If the validator itself fails, pass through — don't block rendering
  console.warn('[diagram-validator] validator failed to respond — skipping semantic check')
  return { ok: true }
}

// ─── LLM calls ───────────────────────────────────────────────────────────────

async function callValidator(
  diagramJson: string,
  strict: boolean
): Promise<{ ok: true; text: string } | { ok: false }> {
  try {
    const res = await fetch(OLLAMA_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:  OLLAMA_MODEL,
        stream: false,
        format: 'json',
        think:  false,
        options: {
          temperature: strict ? 0 : 0.1,
          num_predict: 512,             // verdict is small — cap tokens for speed
        },
        messages: [
          { role: 'system', content: VALIDATOR_SYSTEM_PROMPT },
          { role: 'user',   content: `Validate this DiagramJSON:\n${diagramJson}` },
        ],
      }),
    })
    if (!res.ok) return { ok: false }
    const data = await res.json() as { message?: { content?: string } }
    const text = data.message?.content ?? ''
    return text ? { ok: true, text } : { ok: false }
  } catch {
    return { ok: false }
  }
}

async function callValidatorAnthropic(
  diagramJson: string,
  apiKey: string
): Promise<{ ok: true; text: string } | { ok: false }> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',  // fast + cheap for validation
        max_tokens: 512,
        system:     VALIDATOR_SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: `Validate this DiagramJSON:\n${diagramJson}` }],
      }),
    })
    if (!res.ok) return { ok: false }
    const data = await res.json() as { content?: Array<{ type: string; text?: string }> }
    const text = data.content?.find(b => b.type === 'text')?.text ?? ''
    return text ? { ok: true, text } : { ok: false }
  } catch {
    return { ok: false }
  }
}

// ─── Parse validator response ─────────────────────────────────────────────────

function parseValidatorResponse(raw: string): DiagramValidationResult | null {
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/, '')
      .trim()

    const obj = JSON.parse(cleaned) as {
      valid:   boolean
      issues?: Array<{
        type:         string
        description:  string
        affected_ids: string[]
      }>
    }

    if (obj.valid === true) return { ok: true }

    if (obj.valid === false && Array.isArray(obj.issues)) {
      const issues: ValidationIssue[] = obj.issues
        .filter(i => VALID_ISSUE_TYPES.has(i.type))
        .map(i => ({
          type:         i.type as IssueType,
          description:  i.description,
          affected_ids: i.affected_ids ?? [],
        }))

      return issues.length > 0 ? { ok: false, issues } : { ok: true }
    }

    return null
  } catch {
    return null
  }
}

const VALID_ISSUE_TYPES = new Set<string>([
  'duplicate_relation',
  'conflicting_relation',
  'meaningless_spec',
])
