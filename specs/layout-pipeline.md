# SPEC: Layout Pipeline
**Version:** 0.2
**Status:** Approved
**Depends on:** Diagram JSON spec (v0.4), Plugin Contract spec (v0.4), Space Manager Interface spec (v0.4)
**Supersedes:** Space Manager Interface spec sections on layout algorithm (those are deferred here)

---

## Overview

The layout pipeline transforms a validated Diagram JSON into a complete coordinate map. It is composed of four distinct sub-stages, each with a single responsibility:

```
DiagramJSON (semantic)
       │
       ▼
┌─────────────────────┐
│  Sub-stage 1        │
│  Graph Builder      │  extract pure topology (nodes + edges)
└─────────────────────┘
       │ Graph
       ▼
┌─────────────────────┐
│  Sub-stage 2        │
│  Geometry Planner   │  determine ranks, ordering, layout mode
└─────────────────────┘
       │ DiagramGeometry
       ▼
┌─────────────────────┐
│  Sub-stage 3        │
│  Space Manager      │  assign sizes + compute pixel coordinates
└─────────────────────┘
       │ SpaceManagerOutput
       ▼
┌─────────────────────┐
│  Sub-stage 4        │
│  Workflow Engine    │  call plugin render fns → compose SVG
└─────────────────────┘
       │ SVG string
       ▼
Validation Layer → Master Agent
```

This separation ensures that each stage operates on a clean, typed contract and can be replaced independently (e.g. swapping the Geometry Planner implementation from hand-rolled Sugiyama to elkjs without touching the Space Manager).

---

## Sub-stage 1 — Graph Builder

**Input:** `DiagramJSON`
**Output:** `Graph`

```ts
interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
interface GraphNode {
  id:     string;
  type:   string;
  parent: string | null;
}
interface GraphEdge {
  id:    string;
  from:  string;
  to:    string;
  label: string | undefined;
}
```

### Extraction rules

- **Nodes**: every component where the plugin's `visual_form` is not `"line"` and not `"overlay"`
- **Edges**: every component where the plugin's `visual_form` is `"line"`, reading `from`/`to` from `props`
- Connector `label` is extracted and carried in the edge for use by the Geometry Planner and layout gap computation
- Overlay components (badges, annotations) are excluded from both — they are positioned by the Space Manager relative to their parent, outside the graph algorithm

### What Graph Builder must NOT do

- Make any layout or routing decisions
- Filter or reorder components
- Access component `props` beyond `from`, `to`, and `label` on connectors

---

## Sub-stage 2 — Geometry Planner

**Input:** `Graph`, `diagram_type`
**Output:** `DiagramGeometry`

```ts
type GeometryMode = 'dag-tb' | 'seq-lr' | 'swim-lane'

interface DiagramGeometry {
  mode:   GeometryMode;
  ranks:  string[][];
  nodes:  Record<string, GeometryNode>;
  edges:  GeometryEdge[];
}

interface GeometryNode {
  id:    string;
  rank:  number;
  order: number;
  lane?: string;
}

type EdgeRoute = 'direct' | 'bypass-right' | 'bypass-left'

interface GeometryEdge {
  id:    string;
  from:  string;
  to:    string;
  route: EdgeRoute;
}
```

### Mode selection

| `diagram_type` | Geometry mode |
|----------------|---------------|
| `"flowchart"` | `dag-tb` |
| `"sequence"` | `seq-lr` |
| `"architecture"` | `seq-lr` |
| `"swim-lane"` | `swim-lane` |
| missing / unknown | `seq-lr` |

### dag-tb algorithm (Sugiyama framework)

The layout pipeline uses **elkjs** (Eclipse Layout Kernel, JS port) for all diagram types. The hand-rolled Sugiyama algorithm has been replaced.

elkjs provides:
- Full Sugiyama pipeline including crossing minimisation (Barycentric heuristic)
- NETWORK_SIMPLEX coordinate assignment — balances node positions across all incoming edges, which correctly centres hub nodes (e.g. an API Gateway receiving connections from clients at different ranks)
- Proper handling of long-range edges via virtual nodes
- Hierarchical compound node support — parent-child containment passed directly to ELK, cross-container edges routed without passing through node interiors
- Async API (`elk.layout(graph)` returns a Promise) — pipeline is already async end-to-end

**Note on node placement strategy:** `NETWORK_SIMPLEX` is used rather than `BRANDES_KOEPF`. `BRANDES_KOEPF` aligns each node with its nearest neighbour, which leaves hub nodes off-centre when their clients sit at different ranks (one client direct, another via a longer chain). `NETWORK_SIMPLEX` minimises total edge length across all incoming edges and produces a visually centred result in these cases.

### seq-lr algorithm

Each root node (no incoming edges, or first node by sequence) becomes its own rank in order. One node per rank typically. No crossing minimisation needed — sequence is inherently linear.

### swim-lane algorithm

Each swim-lane container (`visual_form === "band"`) becomes one rank in the outer structure. Its children are nodes within that rank, ordered by their position in the `components` array. The `lane` field on `GeometryNode` is set to the container's ID.

---

## Sub-stage 3 — Space Manager (Layout)

**Input:** `DiagramGeometry`, sized `DiagramJSON`
**Output:** `SpaceManagerOutput` (see Space Manager Interface spec)

The Space Manager consumes the geometry and produces pixel coordinates. It never re-runs the Geometry Planner — it trusts the geometry it receives.

### Gap computation

Gaps between ranks are **content-driven**, not hardcoded:

```
rankGap(rankA, rankB) = max(
  MIN_GAP,
  max over all edges crossing A→B of:
    estimateTextWidth(edge.label, LABEL_FONT_SIZE) + LABEL_CLEARANCE * 2   // horizontal
    OR
    (LABEL_FONT_SIZE + 4) * 2 + 8                                          // vertical
)
```

This ensures connector labels always fit within the gap — no overlap regardless of label length.

### Edge routing

The Space Manager routes edges based on the `route` field from `DiagramGeometry`:

| Route type | Routing |
|------------|---------|
| `direct` | Orthogonal: exits source center, enters target center; direction based on geometry mode |
| `bypass-right` | Exits source right-center, swings right by bypass margin, enters target right-center |
| `bypass-left` | Exits source left-center, swings left by bypass margin, enters target left-center |

**Planned: libavoid-js integration**

libavoid-js (WASM port of libavoid) provides:
- A*-based visibility graph routing
- Guarantees connectors never pass through node interiors (except source/target)
- Handles overlapping nodes gracefully
- Async API (WASM initialisation + route computation)

When libavoid-js is integrated:
- The routing phase becomes async (pipeline is already async — no structural change needed)
- The edge route classification from `GeometryEdge.route` may become advisory (libavoid may override with a better path)
- The `bypass-right` / `bypass-left` distinction becomes unnecessary (libavoid finds optimal paths automatically)

---

## Sub-stage 4 — Workflow Engine

See `workflow-engine-interface.md`. Takes `SpaceManagerOutput` and produces a complete SVG string.

---

## Pipeline Async Status

The pipeline is **already async** end-to-end following elkjs integration:

```ts
export async function runPipeline(diagram: DiagramJSON): Promise<PipelineResult>
```

`runPipeline` is the single async boundary — callers only see one await. The Master Agent handles async rendering without structural change.

When libavoid-js is integrated, the routing phase inside the Space Manager becomes async. This is contained within `runSpaceManager` and does not change the pipeline's external interface.

---

## Open Items

| ID | Item |
|----|------|
| — | ~~**elkjs integration**~~ — implemented. ELK Layered algorithm with NETWORK_SIMPLEX node placement. |
| — | **libavoid-js integration**: install libavoid-js WASM, replace hand-rolled orthogonal routing in Space Manager. Requires WASM initialisation before first use. Pipeline is already async — no structural change needed. |
| — | Crossing minimisation in seq-lr mode — currently not needed (linear), but may be required for multi-row architecture diagrams |
| — | Whether elkjs node ordering should be constrained by `components` array order or left fully free — product decision (currently `NODES_AND_EDGES` model order strategy is active) |
