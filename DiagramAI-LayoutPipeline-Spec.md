# DIAGRAMAI — LAYOUT PIPELINE SPECIFICATION
# Version: 0.2
# Stage: Research complete, ready for implementation
# Audience: Claude Code — use this to implement the full layout pipeline
# Reference: DiagramAI-ClaudeCode-Design.md (master design document)
# Reference: DiagramAI-JSON-Spec.md (JSON spec)

---

## DOCUMENT PURPOSE

This document specifies the four-stage layout pipeline that transforms a
Diagram JSON (all coordinates null) into a rendered SVG.

Each stage has a single responsibility and a defined input/output contract.
No stage performs work that belongs to another stage.
Do not implement anything not defined here without human approval.

---

## PIPELINE OVERVIEW

```
DiagramJSON (coords null)
        │
        ▼
┌───────────────────┐
│   Graph Builder   │  Topology only — nodes, edges, containment hierarchy
└───────────────────┘
        │ Graph
        ▼
┌───────────────────┐
│ Geometry Planner  │  Sugiyama ranks, node sizing, logical edge directions
└───────────────────┘
        │ DiagramGeometry
        ▼
┌───────────────────┐
│   Space Manager   │  Absolute coords, libavoid routing, label placement
└───────────────────┘
        │ CoordinateMap + canvas dimensions
        ▼
┌───────────────────┐
│  Workflow Engine  │  Dispatches to renderer plugins → SVG
└───────────────────┘
        │
        ▼
       SVG
```

Each stage is a pure function:
  Same input always produces same output
  No internal state
  No side effects
  On failure: return structured error to Master Agent immediately

---

## STAGE 1 — GRAPH BUILDER

### Responsibility
Translate the flat Diagram JSON into a typed graph data structure.
Graph Builder owns topology — what connects to what, what contains what.
Graph Builder owns validation — detecting structural errors before any
algorithm runs.
Graph Builder does NOT size nodes, assign ranks, or compute any geometry.

### Input
Diagram JSON as defined in DiagramAI-JSON-Spec.md

### Output: Graph

```typescript
interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  containment: ContainmentTree;
}

interface GraphNode {
  id: string;
  node_type: string;       // swimlane | service_box | container | person | tech_pill | group | custom
  visual_form: string;     // box | cylinder | circle | band | pill | etc.
  theme_category: string;
  context: { concept: string; qualifier: string | null };
  logical: {
    lane: string | null;   // id of parent swimlane node
    group: string | null;  // id of parent container/group node
    order: number | null;  // sequence hint within lane or group
  };
  attached_icons: string[];   // icon ids attached to this node
  attached_labels: string[];  // label ids attached to this node
  attached_badges: string[];  // badge ids attached to this node
}

interface GraphEdge {
  id: string;
  source: string;   // node id
  target: string;   // node id
  style: {
    line: "solid" | "dashed" | "dotted";
    direction: "forward" | "backward" | "bidirectional" | "none";
    weight: "normal" | "heavy" | "light";
  };
  semantic: string;
  theme_category: string;
  attached_labels: string[];  // annotation label ids on this connector
}

interface ContainmentTree {
  // Maps parent node id → array of direct child node ids
  // Swimlane → its member nodes
  // Container/Group → its member nodes
  // Nodes not inside any container → under "root"
  children: Map<string | "root", string[]>;
  // Maps child node id → parent node id (or "root")
  parent: Map<string, string | "root">;
}
```

### Validation rules
Graph Builder validates before returning. On any violation, return error.

- Every connector source and target must match an existing node id
- Every label.attached_to must match an existing node, connector, icon, or badge id
- Every icon.attached_to must match an existing node id
- Every badge.attached_to must match an existing node id
- Every logical.lane value must match an existing node id with node_type="swimlane"
- Every logical.group value must match an existing node id with node_type in
  ("container", "group")
- No node may declare both logical.lane and logical.group
  (a node is inside either a swimlane or a container, not both)
- No swimlane node may itself be inside another swimlane (no nested swimlanes)

Validation does NOT check:
- Whether the diagram is too large to lay out (Geometry Planner handles this)
- Whether connectors cross nodes (Space Manager handles this)
- Whether labels overflow their parents (Space Manager handles this)

### Error format
```json
{
  "stage": "graph_builder",
  "status": "error",
  "error_type": "invalid_reference | missing_parent | nested_swimlane | ambiguous_containment",
  "message": "human readable description",
  "affected_entities": ["id1", "id2"]
}
```

---

## STAGE 2 — GEOMETRY PLANNER

### Responsibility
Take the Graph and compute the abstract geometry of the diagram.
This stage runs the Sugiyama algorithm to determine ranks, ordering, and
node sizing. It also computes logical edge directions — the intent of how
each connector flows — but NOT absolute coordinates or actual pixel paths.

Geometry Planner does NOT know about canvas size.
Geometry Planner does NOT produce absolute coordinates.
Geometry Planner does NOT run libavoid.

### Input
Graph (output of Graph Builder)

### Output: DiagramGeometry

```typescript
interface DiagramGeometry {
  nodes: NodeGeometry[];
  edges: EdgeGeometry[];
  canvas_hint: {
    // Relative dimensions — not absolute units
    // Space Manager maps these to actual canvas coordinates
    width_units: number;   // number of rank columns
    height_units: number;  // number of layers
  };
}

interface NodeGeometry {
  id: string;
  rank: number;           // horizontal layer assigned by Sugiyama (0-indexed)
  order: number;          // position within rank (0-indexed, crossing-minimised)
  estimated_width: number;   // in canvas units — see sizing rules below
  estimated_height: number;  // in canvas units
  containment_depth: number; // 0 = top level, 1 = inside swimlane, 2 = inside container within swimlane
}

interface EdgeGeometry {
  id: string;
  source_id: string;
  target_id: string;
  logical_route: LogicalRoute;
}

interface LogicalRoute {
  // Direction as the crow flies — intent only, no absolute coords
  primary_direction: "left_to_right" | "right_to_left" | "top_to_bottom" | "bottom_to_top";
  // Which side of source node the connector leaves from
  source_port: "left" | "right" | "top" | "bottom";
  // Which side of target node the connector arrives at
  target_port: "left" | "right" | "top" | "bottom";
  // Number of direction changes expected (bends)
  // 0 = straight line, 1 = one bend, 2 = two bends
  // This is a hint to libavoid — actual bend count may differ
  expected_bends: number;
  // Whether this edge crosses a lane boundary
  crosses_lane: boolean;
}
```

### Algorithm: Sugiyama framework via elkjs

Library: elkjs
npm package: elkjs
License: EPL-2.0 (Eclipse Public License — permissive, requires notice)
Repository: https://github.com/kieler/elkjs

Why Sugiyama / elkjs:
- Academically validated standard for hierarchical technical diagrams
- Used by Graphviz (dot), yFiles, and all major commercial diagram tools
- Swimlane containment is a first-class feature via partition constraints
- Nested containers handled natively as compound nodes
- Crossing minimisation built in
- Actively maintained JavaScript port available

Why not dagre:
- Container-to-container connectors not natively supported
- Multi-segment edge routes are curved not orthogonal
- Less actively maintained

Why not force-directed (D3-force etc.):
- Produces unpredictable, non-deterministic layouts
- Designed for organic network visualisation not structured technical diagrams
- Research confirms hierarchical layouts are more comprehensible for
  causal/directional diagrams

### Sugiyama internal steps (handled by elkjs, not implemented by Claude Code)

Step 1 — Cycle removal
  Makes graph acyclic by temporarily reversing minimal set of edges.
  Uses greedy feedback arc set (FAS) heuristic.
  Reversed edges restored after layout.

Step 2 — Layer assignment
  Assigns each node to a horizontal rank/layer.
  Uses network simplex algorithm.
  Goal: minimise number of layers and length of long edges.

Step 3 — Crossing minimisation
  Orders nodes within each rank to minimise edge crossings.
  Uses barycenter heuristic with iterative refinement.
  NP-hard problem — heuristic produces near-optimal results.

Step 4 — Coordinate assignment
  Assigns relative x/y positions within rank structure.
  Uses Brandes–Köpf algorithm.
  Goal: compact layout, straight long edges, centred nodes relative to neighbours.

### ELK graph construction from Graph

```javascript
const elkGraph = {
  id: "root",
  layoutOptions: {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT",            // LEFT_RIGHT default — see OD-GP-01
    "elk.layered.spacing.nodeNodeBetweenLayers": "80",
    "elk.spacing.nodeNode": "40",
    "elk.padding": "[top=40, left=40, bottom=40, right=40]",
    "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  },
  children: [],
  edges: []
};
```

Node mapping from GraphNode to ELK node:

```javascript
function toElkNode(graphNode) {
  const elkNode = {
    id: graphNode.id,
    width: estimateWidth(graphNode),
    height: estimateHeight(graphNode),
    layoutOptions: {}
  };

  // Swimlane partition — nodes in same lane stay together
  if (graphNode.logical.lane) {
    elkNode.layoutOptions["elk.partitioning.partition"] =
      graphNode.logical.lane;
  }

  // Order hint within lane or group
  if (graphNode.logical.order !== null) {
    elkNode.layoutOptions["elk.position"] =
      `(${graphNode.logical.order}, 0)`;
  }

  // Swimlane header styling
  if (graphNode.node_type === "swimlane") {
    elkNode.layoutOptions["elk.nodeLabels.placement"] =
      "INSIDE V_TOP H_LEFT";
    elkNode.layoutOptions["elk.nodeSize.constraints"] =
      "MINIMUM_SIZE";
    elkNode.layoutOptions["elk.nodeSize.minimum"] = "(800, 120)";
  }

  // Container nodes become ELK compound nodes
  if (graphNode.node_type === "container" ||
      graphNode.node_type === "group") {
    elkNode.children = [];
    elkNode.layoutOptions["elk.padding"] =
      "[top=40, left=40, bottom=40, right=40]";
  }

  return elkNode;
}
```

Containment mapping — use ContainmentTree to nest child nodes inside
ELK compound nodes:

```javascript
function buildElkChildren(parentId, containmentTree, graphNodes) {
  const childIds = containmentTree.children.get(parentId) || [];
  return childIds.map(childId => {
    const graphNode = graphNodes.find(n => n.id === childId);
    const elkNode = toElkNode(graphNode);
    // Recursively nest grandchildren
    const grandchildren = containmentTree.children.get(childId);
    if (grandchildren && grandchildren.length > 0) {
      elkNode.children = buildElkChildren(childId, containmentTree, graphNodes);
    }
    return elkNode;
  });
}
```

### Node sizing estimates (canvas units)

These are estimates used for layout computation.
Canvas coordinate system: 1000 units wide.
The Space Manager uses these estimates when mapping to absolute coordinates.

Sizing by node_type:

```
swimlane:
  min_width:  800 units
  min_height: 120 units
  actual:     computed by ELK from contents

service_box:
  width:  max(longest_label_chars × 8 + 48, 140)
  height: 56 if subtitle label exists, 44 if title only

container:
  min_width:  300 units
  min_height: 160 units
  actual:     computed by ELK from contents
  padding:    40 units inside on all sides

person:
  width:  80
  height: 100  (circle + label space below)

tech_pill:
  width:  max(label_chars × 7 + 32, 80)
  height: 32

group:
  min_width:  200 units
  min_height: 100 units
  actual:     computed by ELK from contents

custom:
  width:  120
  height: 56
```

Label character estimation for node sizing:
  Find all labels with attached_to matching this node id
  title label: chars × 8 estimated width at normal size
  subtitle label: chars × 7 estimated width at small size
  Node width = max(title_width, subtitle_width) + 48 padding, minimum 140

### Extracting NodeGeometry from ELK output

```javascript
function extractNodeGeometry(elkOutput, containmentDepth = 0) {
  const geometries = [];
  (elkOutput.children || []).forEach((elkNode, orderInLayer) => {
    geometries.push({
      id: elkNode.id,
      rank: elkNode.x,              // ELK x = horizontal position = rank
      order: orderInLayer,          // position within rank after crossing min
      estimated_width: elkNode.width,
      estimated_height: elkNode.height,
      containment_depth: containmentDepth
    });
    // Recurse into compound nodes
    if (elkNode.children && elkNode.children.length > 0) {
      geometries.push(
        ...extractNodeGeometry(elkNode, containmentDepth + 1)
      );
    }
  });
  return geometries;
}
```

### Computing LogicalRoute from ELK edge output

After ELK runs, each edge has bend point information. Translate to LogicalRoute:

```javascript
function toLogicalRoute(elkEdge, srcGeometry, tgtGeometry, graph) {
  const goingRight = tgtGeometry.rank > srcGeometry.rank;
  const goingDown  = tgtGeometry.order > srcGeometry.order &&
                     tgtGeometry.rank === srcGeometry.rank;

  const primary_direction = goingRight ? "left_to_right"
    : goingDown ? "top_to_bottom"
    : tgtGeometry.rank < srcGeometry.rank ? "right_to_left"
    : "bottom_to_top";

  const source_port = goingRight ? "right" : goingDown ? "bottom"
    : !goingRight ? "left" : "top";
  const target_port = goingRight ? "left" : goingDown ? "top"
    : !goingRight ? "right" : "bottom";

  const srcEdge = graph.edges.find(e => e.id === elkEdge.id);
  const srcNode = graph.nodes.find(n => n.id === srcEdge.source);
  const tgtNode = graph.nodes.find(n => n.id === srcEdge.target);
  const crosses_lane = srcNode.logical.lane !== tgtNode.logical.lane;

  const expected_bends = (elkEdge.sections || []).reduce(
    (acc, s) => acc + (s.bendPoints ? s.bendPoints.length : 0), 0
  );

  return {
    primary_direction,
    source_port,
    target_port,
    expected_bends,
    crosses_lane
  };
}
```

### Error format
```json
{
  "stage": "geometry_planner",
  "status": "error",
  "error_type": "layout_impossible | too_many_nodes | elk_failure",
  "message": "human readable description",
  "affected_entities": ["id1", "id2"]
}
```

---

## STAGE 3 — SPACE MANAGER

### Responsibility
Take the DiagramGeometry and produce a CoordinateMap — absolute canvas
coordinates for every entity in the diagram.

Space Manager owns:
- Mapping relative geometry to absolute 1000-unit canvas coordinates
- Running libavoid with real node positions for actual connector paths
- Placing labels and badges at absolute positions
- Label overlap removal
- Canvas boundary enforcement

Space Manager does NOT:
- Run Sugiyama (Geometry Planner's job)
- Make routing decisions (uses LogicalRoute hints from Geometry Planner)
- Render anything (Workflow Engine's job)

### Input
DiagramGeometry (output of Geometry Planner)
Original Diagram JSON (for icon, label, badge metadata not in DiagramGeometry)

### Output: CoordinateMap + canvas dimensions

```typescript
interface CoordinateMap {
  canvas: {
    width: number;   // always 1000 units
    height: number;  // computed from content
  };
  nodes: Map<string, NodeCoordinates>;
  connectors: Map<string, ConnectorCoordinates>;
  labels: Map<string, LabelCoordinates>;
  icons: Map<string, IconCoordinates>;
  badges: Map<string, BadgeCoordinates>;
}

interface NodeCoordinates {
  x: number; y: number; width: number; height: number;
}

interface ConnectorCoordinates {
  path: string;  // SVG path string e.g. "M 120 80 L 120 140 L 280 140"
}

interface LabelCoordinates {
  x: number; y: number; max_width: number;
  overflow: boolean;  // true if label could not fit within canvas
}

interface IconCoordinates {
  x: number; y: number; width: number; height: number;
}

interface BadgeCoordinates {
  x: number; y: number; radius: number;
}
```

### Step 1 — Map NodeGeometry to absolute coordinates

Scale the relative rank/order positions from ELK to absolute canvas units:

```javascript
function mapNodesToCanvas(nodeGeometries, canvasWidth = 1000) {
  // Find bounding box of all ELK output coordinates
  const maxRank  = Math.max(...nodeGeometries.map(n => n.rank + n.estimated_width));
  const maxOrder = Math.max(...nodeGeometries.map(n => n.order + n.estimated_height));

  const scaleX = (canvasWidth - 80) / maxRank;    // 40px margin each side
  const scaleY = scaleX;                           // uniform scaling

  const nodeCoords = new Map();
  nodeGeometries.forEach(ng => {
    nodeCoords.set(ng.id, {
      x:      Math.round(40 + ng.rank  * scaleX),
      y:      Math.round(40 + ng.order * scaleY),
      width:  Math.round(ng.estimated_width  * scaleX),
      height: Math.round(ng.estimated_height * scaleY)
    });
  });
  return nodeCoords;
}
```

### Step 2 — Connector routing via libavoid

Library: libavoid-js
WebAssembly port of libavoid (C++)
npm package: libavoid-js
License: LGPL-2.1 — acceptable when used as library without modifying source
JS port repository: https://github.com/Aksem/libavoid-js
Original: https://github.com/mjwybrow/adaptagrams

Why libavoid here (not in Geometry Planner):
  libavoid requires absolute coordinates to build its visibility graph.
  The LogicalRoute from Geometry Planner provides directional hints that
  guide libavoid — source_port and target_port tell libavoid which sides
  of the nodes to connect. The actual orthogonal paths are computed here
  once real positions are known.

Why libavoid over alternatives:
  Only production-quality open-source orthogonal connector router available.
  Used in Inkscape, Dunnart, and other professional diagram tools.
  Guarantees routes never pass through node interiors.
  Handles obstacle avoidance around all node shapes correctly.
  No comparable open-source alternatives exist.

libavoid algorithm (internal, listed for understanding):

  Step A — Visibility graph construction
    For each node on canvas, generate horizontal and vertical visibility
    lines from each side and center of node bounding box.
    Lines extend until hitting another node boundary or canvas edge.
    Intersections become graph nodes. Clear paths become graph edges.

  Step B — A* pathfinding
    For each connector, run A* search through visibility graph.
    Cost function penalises total path length and direction changes (bends).
    Guarantees route with minimum bends and minimum length.
    LogicalRoute.source_port and target_port used to seed start/end points.

  Step C — Nudging
    When multiple connectors share a path segment, nudge them apart.
    Preserves routing topology — no new crossings introduced.

libavoid integration:

```javascript
async function routeConnectors(nodeCoords, edgeGeometries, diagramJson) {
  const Avoid = await loadLibavoid();
  const router = new Avoid.Router(Avoid.OrthogonalRouting);

  // Register all nodes as obstacles
  nodeCoords.forEach((coords, nodeId) => {
    const rect = new Avoid.Rectangle(
      new Avoid.Point(coords.x, coords.y),
      new Avoid.Point(coords.x + coords.width, coords.y + coords.height)
    );
    new Avoid.ShapeRef(router, rect);
  });

  // Register connectors using LogicalRoute port hints
  const connRefs = new Map();
  edgeGeometries.forEach(eg => {
    const srcCoords = nodeCoords.get(eg.source_id);
    const tgtCoords = nodeCoords.get(eg.target_id);

    const srcPt = portPoint(srcCoords, eg.logical_route.source_port);
    const tgtPt = portPoint(tgtCoords, eg.logical_route.target_port);

    connRefs.set(eg.id,
      new Avoid.ConnRef(
        router,
        new Avoid.ConnEnd(new Avoid.Point(srcPt.x, srcPt.y)),
        new Avoid.ConnEnd(new Avoid.Point(tgtPt.x, tgtPt.y))
      )
    );
  });

  router.processTransaction();

  // Extract routes as SVG path strings
  const connectorCoords = new Map();
  connRefs.forEach((connRef, connId) => {
    connectorCoords.set(connId, {
      path: routeToSvgPath(connRef.displayRoute())
    });
  });

  return connectorCoords;
}

function portPoint(coords, port) {
  switch (port) {
    case "right":  return { x: coords.x + coords.width, y: coords.y + coords.height / 2 };
    case "left":   return { x: coords.x,                y: coords.y + coords.height / 2 };
    case "bottom": return { x: coords.x + coords.width / 2, y: coords.y + coords.height };
    case "top":    return { x: coords.x + coords.width / 2, y: coords.y };
  }
}

function routeToSvgPath(route) {
  const points = [];
  for (let i = 0; i < route.size(); i++) {
    const pt = route.get_ps(i);
    points.push(`${Math.round(pt.x)} ${Math.round(pt.y)}`);
  }
  return "M " + points.join(" L ");
}
```

### Step 3 — Label and badge placement

No external library. Custom constraint solver. ~150 lines of code.

Step 3a — Anchor to parent

  title labels:
    x = parent.x + parent.width / 2  (centered)
    y = parent.y + parent.height * 0.35
    max_width = parent.width - 16

  subtitle labels:
    x = parent.x + parent.width / 2
    y = title.y + title_height + 8
    max_width = parent.width - 16

  annotation labels (on connectors):
    x = midpoint of connector SVG path + 12 perpendicular offset
    y = midpoint of connector SVG path
    max_width = 120

  callout labels:
    x, y = based on preferred_position relative to parent node bounds
    max_width = 160

  badges by preferred_position:
    top-left:     x = parent.x - radius,              y = parent.y - radius
    top-right:    x = parent.x + width - radius,       y = parent.y - radius
    top-center:   x = parent.x + width / 2,            y = parent.y - radius
    bottom-left:  x = parent.x - radius,              y = parent.y + height - radius
    bottom-right: x = parent.x + width - radius,       y = parent.y + height - radius
    center:       x = parent.x + width / 2,            y = parent.y + height / 2

  badge radius fixed values (canvas units):
    step badges:   14
    status badges:  8
    count badges:  14

  icons:
    x = parent.x + (parent.width - icon_size) / 2
    y = parent.y + 8
    width = height = min(parent.width * 0.4, 48)  (max icon 48 units)

Step 3b — Overlap removal (labels only)

  Priority order (highest = stays in place): title > subtitle > annotation > callout > step
  
  For each pair of overlapping labels:
    Two labels overlap if their bounding boxes intersect
    Push lower-priority label away from higher-priority label
    Push direction: whichever axis requires smaller displacement
  
  Repeat until no overlaps remain or max 50 iterations reached.
  
  Height estimates for overlap detection:
    large size:  22 units
    normal size: 18 units
    small size:  14 units

Step 3c — Boundary clamp

  Clamp all label and badge positions to canvas bounds.
  Minimum margin from canvas edge: 8 units for labels, 0 for badges.
  If label cannot fit within canvas after clamping: set overflow = true.
  Overflow labels are flagged in CoordinateMap — Master Agent reads these
  and may trigger retry with a note that diagram is too dense.

### Canvas dimensions

```javascript
const canvasHeight = Math.max(
  ...Array.from(nodeCoords.values()).map(c => c.y + c.height)
) + 80;  // 80 units bottom padding

const canvas = { width: 1000, height: canvasHeight };
```

### Error format
```json
{
  "stage": "space_manager",
  "status": "error",
  "error_type": "routing_impossible | label_overflow | coordinate_failure",
  "message": "human readable description",
  "affected_entities": ["id1", "id2"]
}
```

---

## STAGE 4 — WORKFLOW ENGINE

### Responsibility
Take the CoordinateMap and the original Diagram JSON, and produce SVG.
Dispatches each entity to its renderer plugin.
Pure execution — no layout decisions, no routing decisions.

### Input
CoordinateMap (output of Space Manager)
Original Diagram JSON (for visual metadata: theme_category, path_data, style etc.)
Active Theme (from context document)

### Output
SVG string

### Dispatch logic

```javascript
function render(coordinateMap, diagramJson, theme) {
  const svgParts = [];

  // Render in correct z-order:
  // 1. Swimlane backgrounds first (lowest layer)
  // 2. Container backgrounds
  // 3. Service boxes, person nodes, tech pills
  // 4. Connectors
  // 5. Icons (on top of their parent nodes)
  // 6. Labels
  // 7. Badges (topmost layer)

  const zOrder = [
    "swimlane", "container", "group",
    "service_box", "person", "tech_pill", "custom",
    "_connectors_",
    "_icons_",
    "_labels_",
    "_badges_"
  ];

  zOrder.forEach(type => {
    if (type === "_connectors_") {
      diagramJson.connectors.forEach(conn => {
        const coords = coordinateMap.connectors.get(conn.id);
        svgParts.push(renderConnector(conn, coords, theme));
      });
    } else if (type === "_icons_") {
      diagramJson.icons.forEach(icon => {
        const coords = coordinateMap.icons.get(icon.id);
        svgParts.push(renderIcon(icon, coords, theme));
      });
    } else if (type === "_labels_") {
      diagramJson.labels.forEach(label => {
        const coords = coordinateMap.labels.get(label.id);
        if (!coords.overflow) svgParts.push(renderLabel(label, coords, theme));
      });
    } else if (type === "_badges_") {
      diagramJson.badges.forEach(badge => {
        const coords = coordinateMap.badges.get(badge.id);
        svgParts.push(renderBadge(badge, coords, theme));
      });
    } else {
      diagramJson.nodes
        .filter(n => n.node_type === type)
        .forEach(node => {
          const coords = coordinateMap.nodes.get(node.id);
          svgParts.push(renderNode(node, coords, theme));
        });
    }
  });

  return `<svg viewBox="0 0 ${coordinateMap.canvas.width} ${coordinateMap.canvas.height}"
    xmlns="http://www.w3.org/2000/svg">${svgParts.join("")}</svg>`;
}
```

### Renderer plugin contract

Each node_type has a renderer plugin. Plugin signature:

```typescript
interface RendererPlugin {
  node_type: string;
  render: (entity: any, coords: any, theme: Theme) => string; // returns SVG fragment
}
```

Renderer plugins are pure functions. They receive coordinates already
computed by the Space Manager. They make no layout decisions.
They only translate coordinates + metadata into SVG markup.

Theme resolution — renderer calls theme lookup for colors:

```javascript
function themeColor(theme, category) {
  return theme.colors[category] || theme.colors.neutral;
}

function themeTextColor(theme, category) {
  return theme.text_colors[category] || theme.text_colors.neutral;
}
```

---

## FULL PIPELINE DATA FLOW SUMMARY

```
DiagramJSON
  ↓ [Graph Builder]
Graph {
  nodes: GraphNode[]       — topology + containment + attachment refs
  edges: GraphEdge[]       — connections + style + semantic
  containment: ContainmentTree  — parent/child hierarchy
}
  ↓ [Geometry Planner — elkjs]
DiagramGeometry {
  nodes: NodeGeometry[]    — rank, order, estimated size, depth
  edges: EdgeGeometry[]    — logical route (direction, ports, bend count hint)
  canvas_hint              — relative width/height units
}
  ↓ [Space Manager — libavoid + custom]
CoordinateMap {
  canvas: { width, height }
  nodes:      Map<id, {x, y, width, height}>
  connectors: Map<id, {path: SVG string}>
  labels:     Map<id, {x, y, max_width, overflow}>
  icons:      Map<id, {x, y, width, height}>
  badges:     Map<id, {x, y, radius}>
}
  ↓ [Workflow Engine — renderer plugins]
SVG string
```

---

## OPEN DECISIONS (do not implement until resolved)

| ID | Decision | Notes |
|----|----------|-------|
| OD-GP-01 | Layout direction default | LEFT_RIGHT (swimlanes as horizontal bands) vs TOP_BOTTOM — LEFT_RIGHT matches ByteByteGo style |
| OD-GP-02 | Max nodes before error | How many nodes before Geometry Planner returns layout_impossible |
| OD-SM-01 | Canvas height cap | Maximum canvas height before diagram must be split |
| OD-SM-02 | Connector port placement | Whether libavoid uses strict port sides or relaxed center attachment |
| OD-SM-03 | Label overlap max iterations | Currently 50 — may need tuning |
| OD-WE-01 | SVG viewport scaling | How canvas units map to final SVG px dimensions |
| OD-WE-02 | Renderer plugin loading | Static registry vs dynamic file-based loading |

---

## DECIDED (safe to implement)

| ID | Decision | Value |
|----|----------|-------|
| D-01 | Stage 1 library | No external library — pure JSON translation + validation |
| D-02 | Stage 2 library | elkjs — ELK Layered (Sugiyama framework) |
| D-03 | Stage 3 connector library | libavoid-js — orthogonal routing with actual coordinates |
| D-04 | Stage 3 label library | Custom constraint solver — no external dependency |
| D-05 | Stage 4 | Renderer plugins — pure functions, no layout decisions |
| D-06 | Algorithm family | Sugiyama hierarchical — not force-directed |
| D-07 | Edge routes in Geometry Planner | Logical only — direction, ports, bend hint. No absolute coords. |
| D-08 | libavoid runs in | Space Manager — after absolute coordinates are assigned |
| D-09 | Canvas width | Always 1000 units |
| D-10 | Canvas height | Computed from content + 80 unit bottom padding |
| D-11 | Coordinate origin | Top-left (0,0), X right, Y down |
| D-12 | Pipeline purity | Every stage is a pure function — same input, same output |
| D-13 | Failure handling | Structured error with stage name — never partial output |
| D-14 | Badge radius fixed | step=14, status=8, count=14 canvas units |
| D-15 | Min node gap | 40 canvas units |
| D-16 | Min canvas edge margin | 40 units for nodes, 8 units for labels |
| D-17 | Z-render order | swimlane → container → nodes → connectors → icons → labels → badges |

---

## IMPLEMENTATION ORDER FOR CLAUDE CODE

Implement one stage at a time. Each stage must pass its unit tests
before the next stage is started.

Stage 1 — Graph Builder:
  1a. Type definitions for Graph, GraphNode, GraphEdge, ContainmentTree
  1b. JSON → Graph translation
  1c. Validation rules — all eight rules listed above
  1d. Error format
  1e. Unit test: full example from DiagramAI-JSON-Spec.md must parse cleanly

Stage 2 — Geometry Planner:
  2a. Install elkjs. Verify it initialises in Node.js.
  2b. Type definitions for DiagramGeometry, NodeGeometry, EdgeGeometry, LogicalRoute
  2c. ELK graph construction from Graph (toElkNode, buildElkChildren)
  2d. Node sizing estimation (estimateWidth, estimateHeight) for all node_types
  2e. Call elk.layout() and verify output
  2f. extractNodeGeometry from ELK output
  2g. toLogicalRoute for each edge
  2h. Unit test: verify all three nodes in full example get rank and order assigned

Stage 3 — Space Manager:
  3a. Canvas coordinate system types and utility functions
      (bounding box intersection, port point calculation, clamp)
  3b. mapNodesToCanvas — scale NodeGeometry to absolute canvas units
  3c. Install libavoid-js. Verify WASM loads in Node.js.
  3d. routeConnectors — register obstacles, register connectors, processTransaction
  3e. routeToSvgPath — extract SVG path string from libavoid route
  3f. Label anchor placement (Step 3a above) for all label_types
  3g. Badge anchor placement for all preferred_position values
  3h. Icon anchor placement
  3i. Overlap removal loop
  3j. Boundary clamp + overflow flag
  3k. Canvas height computation
  3l. Assemble CoordinateMap
  3m. Unit test: all 14 entities in full example have non-null coordinates

Stage 4 — Workflow Engine:
  4a. Theme lookup functions (themeColor, themeTextColor)
  4b. Renderer plugin interface definition
  4c. renderConnector — SVG path with style (solid/dashed/dotted, arrowheads)
  4d. renderNode — for each node_type (swimlane, service_box, person, tech_pill, container)
  4e. renderIcon — path_data scaled to icon coordinates, theme color applied
  4f. renderLabel — text element with max_width truncation
  4g. renderBadge — circle with value text
  4h. Z-order assembly
  4i. SVG wrapper with viewBox
  4j. Integration test: full example produces valid SVG with all entities present

Full integration test:
  Run all four stages sequentially on the full example from DiagramAI-JSON-Spec.md
  Verify the output SVG contains all expected elements
  Verify no coordinates are null or NaN
  Verify connector paths are valid SVG path syntax
  Verify labels do not overflow canvas bounds
