# SPEC: Space Manager Interface
**Version:** 0.4
**Status:** Approved
**Depends on:** Diagram JSON spec (v0.4), Plugin Contract spec (v0.4)
**Blocked by:** ~~OD-04~~ resolved — graph-based Sugiyama layout. ~~OD-10~~ resolved — dynamic canvas.

---

## Overview

The Space Manager is the algorithmic core of the rendering pipeline. It takes a validated Diagram JSON and produces:
1. A **sized** Diagram JSON (same structure, with `size` fields filled in on every component)
2. A **coordinate map** (pixel positions for every component)
3. A **canvas** (`width`, `height`) computed from content extents
4. A **fit status** indicating whether all components were accommodated

The Space Manager works in three phases internally: size assignment, geometry planning, and layout. It is the only component permitted to make layout decisions.

The output of the Space Manager is **fully deterministic**: identical Diagram JSON always produces identical coordinates.

---

## Responsibilities

- Assign concrete dimensions (`w`, `h`) to every component based on content and selected size mode
- Plan the diagram's geometry: ranks, node ordering, layout direction, edge routes
- Map geometry to pixel coordinates
- Compute final canvas dimensions from content extents
- Enforce minimum spacing constraints
- Return a structured error to the Master Agent on any constraint violation — no self-recovery

---

## What the Space Manager Must NOT Do

- Modify `props` or any semantic field in the Diagram JSON
- Make non-deterministic layout choices (no randomness, no heuristics that vary across runs)
- Delegate any layout decision to the renderer
- Attempt to self-recover from constraint violations — fail loudly and return a structured error

---

## Coordinate System

```
Origin:        top-left (0, 0)
X:             increases rightward
Y:             increases downward
Canvas width:  starts at 1000 units; extends rightward if content requires it
Canvas height: computed from content extents — always fits content
Units:         abstract (not pixels) — renderer scales to actual output at draw time
```

The canvas is **infinite in both dimensions** — it always expands to fit content. The initial target width of 1000 units is a preference, not a hard limit. When content cannot fit at 1000 units even at stressed sizing, the canvas extends and the Space Manager reports `fit_status.ok = "partial"`.

---

## Minimum Spacing Rules

These are hard constraints enforced after layout. Any violation causes a structured error.

| Rule | Value |
|------|-------|
| Between any two sibling components (node-to-node gap) | 40 units minimum |
| Between any component and canvas edge | 40 units minimum |
| Between a label and its parent component's edge | 8 units minimum |
| Connector path through a node interior | Not permitted (except at source/target anchor) |
| Connector path through a label bounding box | Not permitted |

Badge components overlap their parent component's border by design — no minimum gap between badge and parent.

---

## Three-Phase Pipeline

```
DiagramJSON (input)
       │
       ▼
Phase 1 — Size Assignment
  • Read plugin.sizes (stressed / normal / liberal) for each component
  • Select mode based on how the diagram fits CANVAS_INITIAL_WIDTH
  • Compute final { w, h } per component from label content + mode floor
  • Write back into diagram.components[].size
       │
       ▼
Phase 2 — Geometry Planning
  Sub-stage A: Graph Builder
    • Extract pure topology from sized DiagramJSON
    • Nodes: non-line, non-overlay components
    • Edges: line/connector components (from → to via props)
  Sub-stage B: Geometry Planner
    • Determine layout mode (dag-tb / seq-lr / swim-lane)
    • Assign rank and order to every node
    • Classify each edge route (direct / bypass-right / bypass-left)
       │
       ▼
Phase 3 — Layout
  • Map (rank, order, size) → pixel coordinates for every node
  • Compute gap between ranks from connector label content
  • Route all edges using waypoints
  • Compute canvas dimensions from coordinate extents
```

---

## Phase 1 — Size Assignment

### Size Modes

The Space Manager selects one of three modes for the initial layout pass:

| Mode | Description | When used |
|------|-------------|-----------|
| `stressed` | Smallest legible size from `plugin.sizes.stressed` | Canvas too tight at `normal` |
| `normal` | Default working size from `plugin.sizes.normal` | Initial default |
| `liberal` | Spacious size from `plugin.sizes.liberal` | Canvas has available room after `normal` |

Selection algorithm for left-to-right diagrams (sequence, architecture, swim-lane):
1. Try `normal`. Estimate total required width.
2. If required > `CANVAS_INITIAL_WIDTH`: switch to `stressed`, re-estimate.
   - If still over limit: proceed with `stressed` and report `fit_status.ok = "partial"`.
3. If required ≤ `CANVAS_INITIAL_WIDTH`: try `liberal`. If it also fits, use `liberal`. Otherwise use `normal`.

For top-to-bottom diagrams (flowchart): always start with `normal`; extend canvas height as needed (never partial).

### Content-driven sizing

The guiding sizes from `plugin.sizes` are a **floor**, not a cap. The Space Manager computes the minimum width required to display the component's label text without truncation and uses whichever is larger: the floor from the selected mode or the text-required width.

```
final_width  = max(plugin.sizes[mode].w, estimateTextWidth(label) + TEXT_PADDING_H * 2)
final_height = plugin.sizes[mode].h   // height is driven by mode, not text (single-line)
```

### Locked sizes

If a component's `size.locked === true`, the Space Manager uses the existing `size.w` and `size.h` verbatim and never overrides them, regardless of mode or content.

---

## Phase 2 — Geometry Planning

### Graph Builder

Extracts pure topology from the sized DiagramJSON:

```ts
interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
interface GraphNode { id: string; type: string; parent: string | null }
interface GraphEdge { id: string; from: string; to: string; label?: string }
```

- **Nodes**: all components where `visual_form !== "line"` and `visual_form !== "overlay"`
- **Edges**: all components where `visual_form === "line"`, reading `from`/`to` from `props`
- Connector `label` is extracted for use in gap computation (Phase 3)

### Geometry Planner

Determines the shape of the diagram — ranks, ordering, layout direction.

```ts
type GeometryMode = 'dag-tb' | 'seq-lr' | 'swim-lane'

interface DiagramGeometry {
  mode:   GeometryMode;
  ranks:  string[][];                       // ranks[r] = list of node IDs at rank r
  nodes:  Record<string, GeometryNode>;     // keyed by node ID
  edges:  GeometryEdge[];
}

interface GeometryNode {
  id:    string;
  rank:  number;
  order: number;   // position within rank (left-to-right or top-to-bottom)
  lane?: string;   // swim-lane ID this node belongs to (swim-lane mode only)
}

type EdgeRoute = 'direct' | 'bypass-right' | 'bypass-left'

interface GeometryEdge {
  id:    string;
  from:  string;
  to:    string;
  route: EdgeRoute;
}
```

#### Mode selection

| `diagram_type` | Geometry mode |
|----------------|---------------|
| `"flowchart"` | `dag-tb` |
| `"sequence"` | `seq-lr` |
| `"architecture"` | `seq-lr` |
| `"swim-lane"` | `swim-lane` |
| missing / unknown | `seq-lr` |

#### Rank assignment (dag-tb)

Uses **Sugiyama longest-path rank assignment** (Kahn's topological sort):
1. Cycle removal: back edges are reversed temporarily
2. Longest-path ranking: each node gets rank = length of longest path from any source
3. Key property: nodes that share a common predecessor (e.g. both targets of a decision diamond) are placed at the **same rank** — they appear side-by-side, never stacked

This means branching patterns naturally produce side-by-side placement without requiring bypass routing. All edges between adjacent ranks are `direct`.

Bypass routing (`bypass-right`, `bypass-left`) is reserved for back-edges (loops) and long-range edges that skip ranks.

#### Swim-lane mode

Each swim-lane container (`visual_form === "band"`) becomes one rank. Its child components are nodes within that rank, ordered by their position in the `components` array. Edges between nodes in different lanes are `direct`; routing direction (left-to-right vs top-to-bottom) is determined at layout time.

---

## Phase 3 — Layout

Maps geometry → pixel coordinates.

### dag-tb layout

- Ranks stack vertically (increasing Y)
- Nodes within a rank are placed side-by-side (centered on canvas width)
- **Gap between ranks** = `max(MIN_GAP, requiredGapForConnectorLabels(rank_r, rank_r+1))`
  - Label gap: `estimateTextWidth(label, LABEL_FONT_SIZE) + LABEL_CLEARANCE * 2` per crossing edge
  - The gap is determined by the widest label crossing that boundary

### seq-lr layout

- Ranks are columns, progressing left-to-right (increasing X)
- All nodes are vertically centered on a shared centerline
- **Gap between columns** = same formula as dag-tb but for horizontal label clearance

### swim-lane layout

- Lane containers stack top-to-bottom
- Within each lane, children flow left-to-right
- Lane height = `max(maxChildHeight + LANE_PADDING * 2, LANE_HEADER + MIN_GAP)`
- Gaps between children within a lane driven by connector labels crossing between them

### Edge routing

After all nodes are placed, connector waypoints are computed:

| Edge type | Routing method |
|-----------|----------------|
| `direct` (same or adjacent rank) | Orthogonal: exits center of source edge, enters center of target edge |
| `bypass-right` | Exits source right, swings right by margin, descends, enters target right |
| `bypass-left` | Exits source left, swings left by margin, descends, enters target left |

The routing direction (left-to-right vs top-to-bottom within a lane) is determined by the geometry mode and lane membership.

---

## Input

```ts
type SpaceManagerInput = DiagramJSON   // validated Diagram JSON — no coordinates, size may be absent
```

---

## Output

```ts
type SpaceManagerOutput = {
  diagram:     DiagramJSON;               // input diagram with size fields written into every component
  coordinates: CoordinateMap;             // keyed by component id
  canvas:      { width: number; height: number };
  fit_status:  FitStatus;
}

type CoordinateMap = {
  [componentId: string]: ComponentCoordinates | ConnectionCoordinates;
}

type FitStatus =
  | { ok: true }
  | { ok: 'partial'; reason: string; affected: string[] }  // canvas extended; content still rendered
  | { ok: false;    reason: string; options: string[]  }   // cannot render even with extension
```

### ComponentCoordinates

```ts
type ComponentCoordinates = {
  x:      number;   // left edge, canvas units
  y:      number;   // top edge, canvas units
  width:  number;
  height: number;
}
```

### ConnectionCoordinates

```ts
type ConnectionCoordinates = {
  waypoints: { x: number; y: number }[];   // at least 2 points; straight segments between them
}
```

---

## Failure Behavior

On any unrecoverable constraint violation (graph cycle, missing plugin, zero-size output):

```ts
type SpaceManagerError = {
  stage:               "space-manager";
  constraint_violated: string;
  components_involved: string[];
  detail:              string;
}
```

The Master Agent uses the structured error to inject context into the Translation Agent for a retry.

`FitStatus.ok = "partial"` is **not** a failure — the Space Manager still returns valid coordinates and the pipeline continues. The Master Agent may present the fit warning to the user.

`FitStatus.ok = false` is a failure (e.g. a single component's stressed size exceeds canvas width). The Space Manager returns a `SpaceManagerError` in this case.

---

## Determinism Contract

The Space Manager is a **pure function** over its inputs:

- Same `diagram` → same `coordinates` + same `canvas`, always
- No randomness
- No dependency on external state, time, or run history

---

## Constants

All sizing constants are defined in `src/engine/space-manager/constants.ts`. The values below are the current defaults — no layout constant is hardcoded anywhere else.

| Constant | Value | Purpose |
|----------|-------|---------|
| `CANVAS_INITIAL_WIDTH` | 1000 | Target canvas width for mode selection |
| `MIN_PADDING` | 40 | Canvas edge padding; minimum node-to-node gap |
| `MIN_GAP` | 24 | Minimum gap between adjacent ranks |
| `LANE_HEADER` | 40 | Left-side header width in swim-lane containers |
| `LANE_PADDING` | 20 | Internal padding within a swim-lane container |
| `BODY_FONT_SIZE` | 12 | Font size for component labels (used in text-width estimation) |
| `LABEL_FONT_SIZE` | 10 | Font size for connector labels |
| `AVG_CHAR_WIDTH` | 0.58 | Fraction of font size per character (average, proportional font) |
| `TEXT_PADDING_H` | 16 | Horizontal padding inside a component's text area |
| `TEXT_PADDING_V` | 12 | Vertical padding inside a component's text area |
| `LABEL_CLEARANCE` | 8 | Minimum horizontal clearance around a connector label |

---

## Open Items

| ID | Item |
|----|------|
| — | ~~**elkjs integration**~~ — implemented. ELK Layered (Sugiyama) with NETWORK_SIMPLEX node placement. Pipeline is async. See `layout-pipeline.md`. |
| — | **libavoid-js integration**: replace hand-rolled orthogonal routing with libavoid-js for A*-based routing that guarantees connectors never pass through node interiors. See `layout-pipeline.md`. |
| — | Minimum padding inside container components (band, cloud, custom) — value TBD |
| — | Bezier curve control points in `ConnectionCoordinates` — currently straight-segment only |
| — | Whether `size` in DiagramJSON should also carry a `mode` field recording which mode produced it |
