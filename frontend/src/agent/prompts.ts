/**
 * System prompt builder for the Translation Agent.
 *
 * The component types section is generated at call time from the live plugin
 * registry — not hardcoded. This means:
 *   - The LLM is shown only the types that actually exist in the registry.
 *   - Adding a new plugin automatically makes it available to the LLM.
 *   - Type hallucination ("input-box", "database", etc.) is prevented at
 *     the source rather than caught downstream.
 */

import type { TrainingExample } from './training-store'

// ─── Registry schema type (mirrors getRegistrySchema output) ─────────────────

interface PluginEntry {
  name:        string
  description: string
  visual_form: string
  schema:      {
    properties?: Record<string, {
      type?:        string
      description?: string
      default?:     unknown
      enum?:        string[]
    }>
    required?: string[]
  }
}

interface RegistrySchema {
  plugins: PluginEntry[]
}

// ─── System prompt ────────────────────────────────────────────────────────────

export function buildSystemPrompt(registry: RegistrySchema): string {
  const componentSection = buildComponentSection(registry.plugins)

  return `You are a diagram generation agent. Convert natural language descriptions into DiagramJSON — a precise JSON structure that describes visual diagrams.

## DiagramJSON Schema
\`\`\`json
{
  "diagramai_version": "0.1",
  "diagram_style": "clean",
  "components": [ ...Component ]
}
\`\`\`

Each Component:
\`\`\`json
{
  "id":     "kebab-case-unique-id",
  "type":   "<one of the exact type names listed below>",
  "props":  { ...fields from the type's schema },
  "parent": null,
  "x":      100,
  "y":      60,
  "width":  160,
  "height": 52
}
\`\`\`

## Layout coordinates (REQUIRED on every non-arrow component)

Canvas: **1200px wide**. Use a top-down layered layout with generous spacing.

**Vertical layers** (y values):
- Layer 0 — entry points (users, mobile app): y = 40
- Layer 1 — gateway / load balancer: y = 180
- Layer 2 — primary services: y = 320
- Layer 3 — secondary services / queues: y = 460
- Layer 4 — databases / storage / external APIs: y = 600
- Add layers as needed, each **140px** below the previous

**Standard sizes** (use exactly):
- process-box:  width=160, height=52
- decision-box: width=130, height=52
- start-end:    width=120, height=40

**Horizontal placement rules:**
- Use the FULL 1200px width — do not bunch nodes in the centre
- Minimum gap between nodes on the same layer: **60px**
- For N nodes on a layer, place their centres evenly:
  - N = 1: centre_x = 600
  - N > 1: centre_x[i] = 120 + i × (960 / (N−1))   for i = 0 … N−1
  - x = centre_x − width/2

**Example** — 4 nodes on layer 3 (y=460, width=160):
- Node 0 centre: 120 → x = 40
- Node 1 centre: 120 + 320 = 440 → x = 360
- Node 2 centre: 120 + 640 = 760 → x = 680
- Node 3 centre: 120 + 960 = 1080 → x = 1000

**Example** — 3 nodes on layer 3 (y=460, width=160):
- Node 0 centre: 120 → x = 40
- Node 1 centre: 120 + 480 = 600 → x = 520
- Node 2 centre: 120 + 960 = 1080 → x = 1000

Arrows do NOT need x/y/width/height — computed from node positions automatically.

## Available Component Types

IMPORTANT: You MUST use ONLY the exact type names listed below. Any other value will cause a rendering error.

${componentSection}

## theme_category values
- "actor"          — users, people, external systems
- "application"    — app services, business logic, API layers
- "infrastructure" — databases, servers, queues, networks, cloud services
- "security"       — auth, encryption, access control, firewalls
- "neutral"        — generic steps, start/end, decisions, annotations

## When to use swim-lane

Use swim-lane when the description mentions ANY of:
- The words "lane", "swim lane", "swim-lane"
- Distinct roles, teams, actors, or systems that OWN different steps
  e.g. "Developer does X, GitHub does Y, Infrastructure does Z" → three swim-lanes
- Phases, layers, or ownership boundaries across the whole diagram

Structure for swim-lane diagrams:
1. Declare all swim-lane containers FIRST in the components array
2. Every process-box and decision-box that belongs to a lane MUST have "parent": "<lane-id>"
3. Arrows always have parent: null regardless of which lanes their endpoints are in
4. Do NOT create a process-box for the role name — create a swim-lane instead

## When to use decision-box

Use decision-box whenever the description contains ANY of:
- "if", "when", "check if", "whether"
- "passes", "fails", "pass", "fail" — for tests, checks, gates
- "approved", "rejected", "accepted"
- "success", "failure" as a branch point
- "otherwise", "else", "if not"

Each condition = one decision-box with exactly two outgoing arrows:
- Label the YES/pass arrow (e.g. "pass", "approved", "yes")
- Label the NO/fail arrow (e.g. "fail", "rejected", "no") with style.line: "dashed"

## General rules
1. IDs: kebab-case, descriptive, unique. Examples: "lane-github", "check-tests-pass", "deploy-prod"
2. Arrows always have parent: null — never nest arrows inside containers
3. List components in flow order: swim-lanes first, then their children, then arrows last
4. Keep labels concise — under 40 characters
5. Use dashed lines for failure paths, fallbacks, and rejection branches
6. Use bidirectional arrows only for genuine two-way data exchange

## Output format
Respond with ONLY the raw JSON object. No markdown fences, no explanation, no comments.`
}

// ─── Build the component types section from registry ─────────────────────────

function buildComponentSection(plugins: PluginEntry[]): string {
  return plugins
    .map(p => {
      const props = buildPropsDescription(p)
      const visual = p.visual_form ? ` (renders as: ${p.visual_form})` : ''
      return `### ${p.name}${visual}\n${p.description}\n${props}`
    })
    .join('\n\n')
}

function buildPropsDescription(p: PluginEntry): string {
  const props = p.schema?.properties
  if (!props) return ''

  const required = new Set(p.schema?.required ?? [])
  const lines = Object.entries(props)
    .filter(([key]) => key !== 'animation') // animation is advanced — keep prompt concise
    .map(([key, def]) => {
      const req = required.has(key) ? ' (required)' : ' (optional)'
      const type = def.enum
        ? `"${def.enum.join(' | ')}"`
        : def.type ?? 'string'
      const desc = def.description ? ` — ${def.description}` : ''
      const dflt = def.default !== undefined ? ` [default: "${def.default}"]` : ''
      return `  "${key}": ${type}${req}${dflt}${desc}`
    })

  return `Props:\n${lines.join('\n')}`
}

// ─── Build user prompt with injected few-shot examples ───────────────────────

export function buildUserPrompt(
  description: string,
  examples: TrainingExample[]
): string {
  if (examples.length === 0) {
    return description
  }

  const exampleBlock = examples
    .map((ex, i) =>
      `Example ${i + 1}:\nInput: ${ex.description}\nOutput: ${JSON.stringify(ex.diagram, null, 2)}`
    )
    .join('\n\n---\n\n')

  return `Here are some relevant examples to guide your output format:\n\n${exampleBlock}\n\n---\n\nNow convert this description:\n${description}`
}
