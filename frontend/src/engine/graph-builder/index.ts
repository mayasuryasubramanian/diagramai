/**
 * Graph Builder — Stage 1 of the layout pipeline.
 *
 * Extracts pure topology from DiagramJSON.
 * Output is a Graph: nodes (non-connectors) and edges (connectors).
 * No positions, sizes, or geometry — just who connects to whom.
 */

import type { DiagramJSON } from '../../types/diagram'
import type { Graph } from '../../types/graph'
import { getPlugin } from '../../plugins/registry'

export function buildGraph(diagram: DiagramJSON): Graph {
  const nodes = diagram.components
    .filter(c => {
      const form = getPlugin(c.type)?.visual_form
      return form !== 'line' && form !== 'overlay'
    })
    .map(c => ({ id: c.id, type: c.type, parent: c.parent }))

  const edges = diagram.components
    .filter(c => getPlugin(c.type)?.visual_form === 'line')
    .flatMap(c => {
      const p = c.props as { from?: string; to?: string; label?: string }
      if (!p.from || !p.to) return []
      return [{ id: c.id, from: p.from, to: p.to, label: p.label }]
    })

  return { nodes, edges }
}
