/**
 * DiagramGeometry — the shape of a diagram.
 *
 * Nodes are still conceptual "dots" — no pixel positions yet.
 * Geometry records which rank (row/column level) each node belongs to,
 * its order within that rank, optional lane membership, and how each
 * edge should be routed. The Space Manager maps this to pixel coordinates.
 */

// How the geometry is structured — tells the Space Manager which layout algorithm to apply
export type GeometryMode =
  | 'dag-tb'     // DAG ranks stacked top-to-bottom (flowchart)
  | 'seq-lr'     // sequential columns left-to-right (architecture, sequence, network)
  | 'swim-lane'  // lanes stacked top-to-bottom, children flow left-to-right within lane

export interface GeometryNode {
  id: string
  rank: number   // which row (dag-tb) or column (seq-lr) level, 0-based
  order: number  // position within the rank, 0-based
  lane?: string  // parent lane ID — only present for swim-lane children
}

// How a specific edge should be drawn
export type EdgeRoute = 'direct' | 'bypass-right' | 'bypass-left'

export interface GeometryEdge {
  id: string  // same as the connector component ID
  from: string
  to: string
  route: EdgeRoute
}

export interface DiagramGeometry {
  mode: GeometryMode
  // ranks[r] = list of root-level node IDs at rank r, in left-to-right order.
  // For swim-lane: ranks[r] = [laneId] — one lane per rank.
  ranks: string[][]
  // Fast lookup: node id → geometry info (includes both root and container children)
  nodes: Record<string, GeometryNode>
  edges: GeometryEdge[]
}
