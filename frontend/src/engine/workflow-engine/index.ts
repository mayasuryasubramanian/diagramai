import type { DiagramJSON, DiagramStyle } from '../../types'
import type { SpaceManagerOutput } from '../../types/space-manager'
import type { WorkflowEngineError } from '../../types/validation'
import { getPlugin } from '../../plugins/registry'

export interface WorkflowEngineOutput {
  svg: string
  canvas_height: number
}

export type WorkflowResult = WorkflowEngineOutput | WorkflowEngineError

export function runWorkflowEngine(
  input: SpaceManagerOutput,
  diagram_style: DiagramStyle
): WorkflowResult {
  const { diagram, coordinates } = input

  // Step 1 — Validate completeness before rendering begins
  // Connectors with unresolvable from/to IDs are skipped (AI hallucination resilience).
  // Missing nodes (non-connectors) are a hard error — the diagram is structurally broken.
  const skippedIds = new Set<string>()
  for (const component of diagram.components) {
    const plugin = getPlugin(component.type)
    if (!plugin) {
      return {
        stage: 'workflow-engine',
        component_id: component.id,
        plugin_name: component.type,
        failure_reason: 'missing-plugin',
        detail: `Plugin "${component.type}" is not registered`,
      }
    }
    if (!(component.id in coordinates)) {
      if (plugin.visual_form === 'line') {
        skippedIds.add(component.id)
        continue
      }
      return {
        stage: 'workflow-engine',
        component_id: component.id,
        plugin_name: component.type,
        failure_reason: 'missing-coordinates',
        detail: `No coordinates found for component "${component.id}"`,
      }
    }
  }

  // Step 2 — Determine render order: parents before children
  const ordered = topologicalOrder(diagram)

  // Step 3 — Canvas dimensions come from Space Manager (computed from content)
  const { width: canvasW, height: canvasH } = input.canvas

  // Step 4 — Build SVG root
  const NS = 'http://www.w3.org/2000/svg'
  const root = document.createElementNS(NS, 'svg')
  root.setAttribute('xmlns', NS)
  root.setAttribute('viewBox', `0 0 ${canvasW} ${canvasH}`)
  root.setAttribute('width', String(canvasW))
  root.setAttribute('height', String(canvasH))
  root.setAttribute('data-diagramai', 'true')

  const context = { diagram_style }

  // Step 5 — Render each component, append to root
  for (const component of ordered) {
    if (skippedIds.has(component.id)) continue
    const plugin = getPlugin(component.type)!
    const coord = coordinates[component.id]

    try {
      const result = plugin.render(component.props, coord, context)
      const elements = Array.isArray(result) ? result : [result]
      for (const el of elements) {
        root.appendChild(el)
      }
    } catch (err) {
      return {
        stage: 'workflow-engine',
        component_id: component.id,
        plugin_name: component.type,
        failure_reason: 'render-error',
        detail: err instanceof Error ? err.message : String(err),
      }
    }
  }

  return {
    svg: root.outerHTML,
    canvas_height: canvasH,
  }
}

export function isWorkflowEngineError(
  result: WorkflowResult
): result is WorkflowEngineError {
  return 'stage' in result && result.stage === 'workflow-engine'
}

// Topological order: parents rendered before children.
// Siblings retain their original array order.
function topologicalOrder(diagram: DiagramJSON): DiagramJSON['components'] {
  const childrenOf = new Map<string | null, DiagramJSON['components']>()

  for (const c of diagram.components) {
    const key = c.parent ?? null
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(c)
  }

  const result: DiagramJSON['components'] = []

  function visit(parentId: string | null) {
    const children = childrenOf.get(parentId) ?? []
    for (const child of children) {
      result.push(child)
      visit(child.id)
    }
  }

  visit(null)
  return result
}

