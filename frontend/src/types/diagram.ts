// Diagram JSON types — from diagram-json spec v0.5
//
// diagram_type is intentionally removed. The layout engine derives structure
// purely from component relationships (parent-child containment + edges).
// Any existing data with a diagram_type field is still valid — it is ignored.

export type DiagramStyle = 'clean' | 'handwritten'

export interface DiagramJSON {
  diagramai_version: string
  diagram_style: DiagramStyle
  components: Component[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any  // tolerate legacy fields (e.g. diagram_type from old data)
}

// Per-instance size in the diagram. Space Manager initialises this from the plugin's
// normal guiding size and may adjust it based on the overall diagram situation.
// Once the user explicitly sets a size it becomes locked and Space Manager must respect it.
export interface ComponentSize {
  w: number
  h: number
  locked: boolean
}

export interface Component {
  id: string
  type: string       // must match a registered plugin name
  props: Record<string, unknown>
  parent: string | null
  size?: ComponentSize  // absent = not yet sized; Space Manager sets this in Phase 1
  // AI-provided layout coordinates (Option C). When present on all nodes, ELK is skipped.
  x?: number
  y?: number
  width?: number
  height?: number
}
