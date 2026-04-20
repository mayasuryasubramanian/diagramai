/**
 * Graph — pure topology extracted from DiagramJSON.
 * Nodes are identified by ID only. No positions, sizes, or geometry.
 */

export interface GraphNode {
  id: string
  type: string
  parent: string | null
}

export interface GraphEdge {
  id: string
  from: string
  to: string
  label?: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
