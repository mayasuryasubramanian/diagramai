/**
 * Geometry Planner — Stage 2 of the layout pipeline.
 *
 * Takes a Graph (pure topology) and the diagram_type, and determines
 * the shape of the diagram:
 *   - which rank each node belongs to
 *   - ordering within each rank
 *   - lane membership for swim-lane diagrams
 *   - how each edge should be routed (direct vs bypass)
 *
 * Output is DiagramGeometry — still no pixel positions, only relational
 * decisions that the Space Manager will turn into coordinates.
 */

// DiagramType kept here for reference; no longer used by the main layout path
type DiagramType = string
import type { Graph, GraphNode } from '../../types/graph'
import type { DiagramGeometry, GeometryNode, GeometryEdge, EdgeRoute } from '../../types/geometry'
import { getPlugin } from '../../plugins/registry'

export function planGeometry(graph: Graph, diagram_type: DiagramType): DiagramGeometry {
  switch (diagram_type) {
    case 'flowchart':
      return planDAG(graph)
    case 'architecture':
    case 'sequence':
    case 'network':
      return planSequential(graph)
    case 'swim-lane':
      return planSwimLane(graph)
    case 'mind-map':
      return planSequential(graph)  // TODO: radial layout
    default:
      return planSequential(graph)
  }
}

// ─── DAG — top-to-bottom (flowchart) ─────────────────────────────────────────
//
// Uses longest-path rank assignment (Sugiyama-style):
//   rank[node] = max(rank[predecessor] + 1)
//
// This naturally places branching targets at the same rank (side-by-side),
// so a decision diamond's two outputs sit at the same level — no bypass needed.

function planDAG(graph: Graph): DiagramGeometry {
  const rootNodes = graph.nodes.filter(n => !n.parent)
  const nodeIds   = rootNodes.map(n => n.id)
  const idSet     = new Set(nodeIds)

  // Build adjacency lists (filter to root-level nodes only)
  const successors   = new Map<string, string[]>(nodeIds.map(id => [id, []]))
  const predecessors = new Map<string, string[]>(nodeIds.map(id => [id, []]))

  for (const e of graph.edges) {
    if (idSet.has(e.from) && idSet.has(e.to)) {
      successors.get(e.from)!.push(e.to)
      predecessors.get(e.to)!.push(e.from)
    }
  }

  // Kahn's algorithm — topological order + longest-path rank assignment
  const rank:  Record<string, number> = Object.fromEntries(nodeIds.map(id => [id, 0]))
  const inDeg: Record<string, number> = Object.fromEntries(
    nodeIds.map(id => [id, predecessors.get(id)!.length])
  )

  const queue = nodeIds.filter(id => inDeg[id] === 0)
  const topoOrder: string[] = []

  while (queue.length > 0) {
    const id = queue.shift()!
    topoOrder.push(id)
    for (const next of successors.get(id) ?? []) {
      rank[next] = Math.max(rank[next], rank[id] + 1)
      if (--inDeg[next] === 0) queue.push(next)
    }
  }

  // Any nodes not reached (cycles / disconnected) appended in original order
  for (const id of nodeIds) {
    if (!topoOrder.includes(id)) topoOrder.push(id)
  }

  // Build rank buckets preserving topo order within each rank
  const maxRank = Math.max(0, ...topoOrder.map(id => rank[id]))
  const ranks: string[][] = Array.from({ length: maxRank + 1 }, () => [])
  for (const id of topoOrder) ranks[rank[id]].push(id)

  // Build GeometryNode map
  const nodes: Record<string, GeometryNode> = {}
  for (let r = 0; r < ranks.length; r++) {
    for (let o = 0; o < ranks[r].length; o++) {
      nodes[ranks[r][o]] = { id: ranks[r][o], rank: r, order: o }
    }
  }

  // Determine edge routes:
  //   direct   — edge goes from rank r to rank r+1 (adjacent)
  //   bypass-* — edge spans multiple ranks (alternating sides)
  let bypassCounter = 0
  const edges: GeometryEdge[] = graph.edges
    .filter(e => idSet.has(e.from) && idSet.has(e.to))
    .map(e => {
      const span = (rank[e.to] ?? 0) - (rank[e.from] ?? 0)
      let route: EdgeRoute = 'direct'
      if (span !== 1) {
        route = bypassCounter % 2 === 0 ? 'bypass-right' : 'bypass-left'
        bypassCounter++
      }
      return { id: e.id, from: e.from, to: e.to, route }
    })

  return { mode: 'dag-tb', ranks, nodes, edges }
}

// ─── Sequential — left-to-right (architecture, sequence, network) ─────────────
//
// Each root node becomes its own rank (column), preserving the order
// they appear in the diagram JSON.

function planSequential(graph: Graph): DiagramGeometry {
  const rootNodes = graph.nodes.filter(n => !n.parent)
  const ranks     = rootNodes.map(n => [n.id])

  const nodes: Record<string, GeometryNode> = {}
  rootNodes.forEach((n, i) => {
    nodes[n.id] = { id: n.id, rank: i, order: 0 }
  })

  const rootSet = new Set(rootNodes.map(n => n.id))
  const edges: GeometryEdge[] = graph.edges
    .filter(e => rootSet.has(e.from) && rootSet.has(e.to))
    .map(e => ({ id: e.id, from: e.from, to: e.to, route: 'direct' as EdgeRoute }))

  return { mode: 'seq-lr', ranks, nodes, edges }
}

// ─── Swim-lane ────────────────────────────────────────────────────────────────
//
// Lanes are container nodes (visual_form === 'band') stacked top-to-bottom.
// Each lane's children flow left-to-right within the lane.
// Each lane occupies one rank; its children share that rank tagged with lane id.

function planSwimLane(graph: Graph): DiagramGeometry {
  const isLane = (n: GraphNode) => getPlugin(n.type)?.visual_form === 'band'

  const lanes     = graph.nodes.filter(n => !n.parent && isLane(n))
  const ranks     = lanes.map(l => [l.id])
  const nodes: Record<string, GeometryNode> = {}

  lanes.forEach((lane, laneIdx) => {
    nodes[lane.id] = { id: lane.id, rank: laneIdx, order: 0 }

    const children = graph.nodes.filter(n => n.parent === lane.id)
    children.forEach((child, childIdx) => {
      nodes[child.id] = { id: child.id, rank: laneIdx, order: childIdx, lane: lane.id }
    })
  })

  const allIds = new Set(Object.keys(nodes))
  const edges: GeometryEdge[] = graph.edges
    .filter(e => allIds.has(e.from) && allIds.has(e.to))
    .map(e => ({ id: e.id, from: e.from, to: e.to, route: 'direct' as EdgeRoute }))

  return { mode: 'swim-lane', ranks, nodes, edges }
}
