# DIAGRAMAI — JSON SPEC DOCUMENT
# Version: 0.1
# Stage: Design (pre-implementation)
# Audience: Claude Code — use this to implement the JSON spec and renderer contracts
# Reference: DiagramAI-ClaudeCode-Design.md (master design document)

---

## DOCUMENT PURPOSE

This document defines the complete JSON specification for DiagramAI.
It covers every drawable entity in the system.
It is the contract between the Translation LLM, the Space Manager, and the Workflow Engine.
Do not implement anything not defined here without human approval.

---

## CORE PRINCIPLE

Every drawable entity is a first-class spec.
No entity has higher priority than another.
No entity has hardcoded position — all coordinates are assigned by the Space Manager.
The Translation LLM produces logical structure only.
The Space Manager infers containment, proximity, and layout from that logical structure.
The Workflow Engine dispatches each spec to its renderer independently.

---

## DIAGRAM JSON TOP LEVEL

The complete diagram is a single JSON object with five flat arrays.
Each array contains specs of that entity type.
No nesting between arrays — relationships are inferred by the Space Manager from logical structure.

```json
{
  "version": "0.1",
  "diagram": {
    "nodes":      [...],
    "connectors": [...],
    "labels":     [...],
    "icons":      [...],
    "badges":     [...]
  }
}
```

### Rules
- Every entity has a unique `id` within its array
- IDs are assigned by the Translation LLM
- IDs are stable across corrections — same logical entity keeps same ID
- Space Manager reads all five arrays together to infer layout
- No entity embeds another entity — containment is inferred, not declared
- Path data for icons is stored directly in the icon spec — no external registry lookup at render time

---

## ENTITY SPECS

---

### 1. NODE

A node is any bounded region in the diagram.
This includes swimlanes, service boxes, containers, person nodes, tech pills, and any other bounded shape.
The `node_type` field tells the renderer which visual treatment to apply.

```json
{
  "id": "string",
  "entity": "node",
  "node_type": "swimlane | service_box | container | person | tech_pill | group | custom",
  "name": "string",
  "visual_form": "string",
  "theme_category": "string",
  "context": {
    "concept": "string",
    "qualifier": "string | null"
  },
  "coordinates": {
    "x": null,
    "y": null,
    "width": null,
    "height": null
  },
  "logical": {
    "lane": "string | null",
    "group": "string | null",
    "order": "integer | null"
  }
}
```

#### Field definitions

`id`
Unique string, assigned by Translation LLM.
Format: `"node_001"`, `"node_002"` etc.
Stable across corrections — same logical entity keeps same ID.

`entity`
Always `"node"` for this spec type.
Used by Workflow Engine to dispatch to correct renderer.

`node_type`
Tells the renderer which visual treatment to apply:
- `swimlane` — horizontal or vertical band grouping related nodes
- `service_box` — standard rectangular service or system representation
- `container` — dashed border grouping e.g. a Kubernetes cluster
- `person` — circular actor node representing a human role
- `tech_pill` — compact rounded pill label for a technology name
- `group` — invisible logical grouping, no visual boundary
- `custom` — renderer falls back to visual_form for drawing instructions

`name`
Descriptive name in `{primary_concept}.{qualifier}` format.
Assigned by Translation LLM from the icon/shape registry vocabulary.
Examples: `"compute.server.rack"`, `"storage.relational.standard"`, `"actor.human.engineer"`
Not displayed to user. Used internally for renderer lookup and LLM selection.

`visual_form`
Geometric description of the shape.
Values: `"box"`, `"cylinder"`, `"circle"`, `"band"`, `"pill"`, `"diamond"`, `"cloud"`, `"stack"`, `"shield"`, `"custom"`
Used by Space Manager for sizing hints and by renderer for fallback drawing.

`theme_category`
Maps to a color in the active theme.
Values: `"infrastructure"`, `"application"`, `"messaging"`, `"security"`, `"actor"`, `"brand"`, `"external"`, `"neutral"`
Renderer looks up actual color from theme at draw time.
Translation LLM assigns category based on concept — never assigns a color directly.

`context.concept`
The primary concept this node represents.
Plain English. Used by Space Manager and renderer for semantic understanding.
Examples: `"API gateway"`, `"message queue"`, `"product owner"`, `"Kubernetes cluster"`

`context.qualifier`
Optional further description.
Examples: `"external"`, `"legacy"`, `"distributed"`, `"encrypted"`
null if not applicable.

`coordinates`
All null when Translation LLM produces the spec.
Space Manager fills all four values before passing to Workflow Engine.
Renderer receives spec with coordinates always populated — never null at render time.

`logical.lane`
ID of the swimlane node this node belongs to.
null if not inside a swimlane.
Space Manager uses this to infer containment and placement within the lane.

`logical.group`
ID of the container or group node this node belongs to.
null if not inside a container.

`logical.order`
Integer hint for left-to-right or top-to-bottom ordering within a lane or group.
1-indexed. Space Manager uses this for sequence layout.
null if order is not meaningful.

---

### 2. CONNECTOR

A connector is a directed or undirected line between two nodes.
It carries semantic meaning — the Translation LLM decides style based on the relationship type.
The Space Manager decides the actual path routing to avoid crossing other nodes or labels.

```json
{
  "id": "string",
  "entity": "connector",
  "source": "string",
  "target": "string",
  "style": {
    "line": "solid | dashed | dotted",
    "direction": "forward | backward | bidirectional | none",
    "weight": "normal | heavy | light"
  },
  "semantic": "string",
  "theme_category": "string",
  "coordinates": {
    "path": null
  }
}
```

#### Field definitions

`id`
Unique string. Format: `"conn_001"`, `"conn_002"` etc.

`entity`
Always `"connector"`.

`source`
ID of the node this connector originates from.
Must match an `id` in the `nodes` array.

`target`
ID of the node this connector points to.
Must match an `id` in the `nodes` array.

`style.line`
Visual line style:
- `solid` — synchronous call, direct dependency, data flow
- `dashed` — asynchronous call, event, optional dependency
- `dotted` — weak association, annotation link, feedback loop

`style.direction`
Arrowhead placement:
- `forward` — arrowhead at target only (most common)
- `backward` — arrowhead at source only
- `bidirectional` — arrowheads at both ends
- `none` — no arrowheads, plain line

`style.weight`
Line thickness relative to theme default:
- `normal` — standard weight (default)
- `heavy` — primary flow, critical path
- `light` — secondary, background relationship

`semantic`
Plain English description of what this connection means.
Used by Space Manager for routing priority and by semantic validator for correctness checking.
Examples: `"sends request to"`, `"publishes event to"`, `"stores data in"`, `"notifies"`

`theme_category`
Maps to connector color in active theme.
Usually `"neutral"` unless the connection has strong semantic category.

`coordinates.path`
null when Translation LLM produces the spec.
Space Manager fills this with an SVG path string after routing.
Format: standard SVG path data e.g. `"M 120 80 L 120 140 L 280 140"`
Renderer uses this path directly — no routing decisions at render time.

---

### 3. LABEL

A label is any text element in the diagram.
Every piece of text — node titles, subtitles, connector annotations, standalone callouts — is a first-class label spec.
No text is embedded inside another entity spec.
The Space Manager places all labels after placing nodes and connectors.

```json
{
  "id": "string",
  "entity": "label",
  "text": "string",
  "label_type": "title | subtitle | annotation | callout | step",
  "attached_to": "string",
  "theme_category": "string",
  "style": {
    "size": "normal | large | small",
    "weight": "regular | medium",
    "align": "left | center | right"
  },
  "coordinates": {
    "x": null,
    "y": null,
    "max_width": null
  }
}
```

#### Field definitions

`id`
Unique string. Format: `"label_001"`, `"label_002"` etc.

`entity`
Always `"label"`.

`text`
The display text. Plain string, no markup.
Maximum 60 characters. Translation LLM must keep labels concise.
If content requires more than 60 characters it should be split into title + subtitle labels.

`label_type`
Semantic role of this label:
- `title` — primary name of a node. One per node.
- `subtitle` — secondary descriptor of a node. One per node maximum.
- `annotation` — text on or near a connector describing the relationship
- `callout` — explanatory text with a leader line pointing to a specific element
- `step` — sequence number displayed as text (use badge spec instead for circled numbers)

`attached_to`
ID of the entity this label belongs to.
Must match an `id` in nodes, connectors, icons, or badges arrays.
Space Manager uses this to place the label relative to its parent entity.
If the parent entity moves during layout, the label moves with it.

`theme_category`
Maps to text color in active theme.
Title labels typically use the darkest stop of the node's theme category.
Subtitle and annotation labels use a lighter stop.
Translation LLM assigns category — renderer resolves to actual color from theme.

`style.size`
- `normal` — standard body text (default)
- `large` — swimlane headers, primary titles
- `small` — subtitles, annotations, callouts

`style.weight`
- `regular` — body text, subtitles, annotations
- `medium` — titles, swimlane headers

`style.align`
Text alignment within its bounding box.
Space Manager sets max_width based on parent entity width.

`coordinates`
All null from Translation LLM.
Space Manager fills x, y, and max_width.
Renderer wraps text at max_width — never overflows.

---

### 4. ICON

An icon is a single drawable SVG primitive — a path representing a visual symbol.
Icons are always associated with a node but are first-class specs.
The Space Manager places icons within their associated nodes.
Path data is stored directly in the spec — no external lookup at render time.
All path data is normalized to a 0 0 100 100 coordinate space during import.
All icons are outline style in the spec — fill/stroke presentation is decided by theme at render time.

```json
{
  "id": "string",
  "entity": "icon",
  "name": "string",
  "visual_form": "string",
  "attached_to": "string",
  "path_data": "string",
  "viewbox": "0 0 100 100",
  "theme_category": "string",
  "presentation": null,
  "coordinates": {
    "x": null,
    "y": null,
    "width": null,
    "height": null
  },
  "meta": {
    "concept": "string",
    "qualifier": "string | null",
    "tags": ["string"],
    "diagram_contexts": ["string"]
  }
}
```

#### Field definitions

`id`
Unique string. Format: `"icon_001"`, `"icon_002"` etc.

`entity`
Always `"icon"`.

`name`
Descriptive name in `{primary_concept}.{qualifier}` format.
This is the name the Translation LLM uses to select this icon.
Examples:
- `"compute.server.rack"`
- `"storage.relational.standard"`
- `"messaging.queue.fifo"`
- `"security.lock.encrypted"`
- `"actor.human.generic"`
- `"brand.docker"`
- `"network.loadbalancer.round-robin"`

`visual_form`
Geometric family of this icon.
Values: `"box"`, `"cylinder"`, `"circle"`, `"shield"`, `"cloud"`, `"stack"`, `"pipe"`, `"diamond"`, `"arrow"`, `"custom"`
Used by Space Manager for sizing and placement hints.

`attached_to`
ID of the node this icon belongs to.
Space Manager places the icon within the bounds of that node.

`path_data`
Full SVG path data string normalized to 0 0 100 100 coordinate space.
Stored directly — no registry lookup needed at render time.
Path data has been transformed from source coordinates during import to break source traceability.

`viewbox`
Always `"0 0 100 100"` — fixed for all icons in this system.
All imported icons are normalized to this coordinate space.

`theme_category`
Maps to icon color in active theme.
Renderer resolves to actual color from theme at draw time.

`presentation`
Always null in the spec.
Theme sets this at render time: `"outline"`, `"filled"`, or `"outlined-filled"`.
Translation LLM never sets this field.

`coordinates`
All null from Translation LLM.
Space Manager fills based on parent node bounds and icon visual_form aspect ratio.

`meta.concept`
Plain English primary concept.
Examples: `"relational database"`, `"load balancer"`, `"message queue"`

`meta.qualifier`
Optional further description.
Examples: `"distributed"`, `"encrypted"`, `"external"`
null if not applicable.

`meta.tags`
Array of keywords the Translation LLM uses for selection.
Maximum 8 tags per icon.
Examples: `["server", "compute", "backend", "rack", "hardware"]`

`meta.diagram_contexts`
Array of diagram types where this icon is appropriate.
Translation LLM uses this to narrow selection when diagram type is known.
Examples: `["system design", "architecture", "devops", "cloud", "network"]`

---

### 5. BADGE

A badge is a small overlay element — typically a circled number indicating sequence or a status indicator.
Badges are first-class specs placed by the Space Manager.
Always attached to a node, positioned at a corner or edge of that node.

```json
{
  "id": "string",
  "entity": "badge",
  "badge_type": "step | status | count",
  "attached_to": "string",
  "value": "string | integer",
  "theme_category": "string",
  "preferred_position": "top-left | top-right | bottom-left | bottom-right | top-center | center",
  "coordinates": {
    "x": null,
    "y": null,
    "radius": null
  }
}
```

#### Field definitions

`id`
Unique string. Format: `"badge_001"`, `"badge_002"` etc.

`entity`
Always `"badge"`.

`badge_type`
- `step` — sequence number in a flow. Rendered as filled circle with number.
- `status` — state indicator. Rendered as small colored dot.
- `count` — quantity indicator. Rendered as filled pill with number.

`attached_to`
ID of the node this badge overlays.
Space Manager places badge at preferred_position relative to that node's bounds.

`value`
The content of the badge.
For `step`: integer e.g. `1`, `2`, `3`
For `status`: string e.g. `"active"`, `"warning"`, `"error"`, `"inactive"`
For `count`: integer e.g. `42`

`theme_category`
Maps to badge background color in active theme.
Step badges always use the theme's step color.
Status badges map to semantic colors: active→success, warning→warning, error→danger.

`preferred_position`
Where the badge prefers to sit relative to its parent node.
Space Manager treats this as a hint not a constraint.
If preferred position causes overlap, Space Manager moves it.
Default for step badges: `"top-left"`

`coordinates`
All null from Translation LLM.
Space Manager fills x, y, and radius.

---

## COORDINATE SYSTEM

All coordinates are in abstract units, not pixels.
The Space Manager works in a normalized canvas of 1000 × N units where N expands to fit content.
The renderer scales to actual output dimensions at draw time.

```
Canvas origin: top-left (0, 0)
X increases right
Y increases down
Canvas width: always 1000 units
Canvas height: computed by Space Manager based on content
```

Minimum spacing rules enforced by Space Manager:
- Between nodes: 40 units minimum
- Between a node and canvas edge: 40 units minimum
- Between a label and its parent node edge: 8 units minimum
- Badge overlaps its parent node border by design — no minimum gap
- Connector path must not cross any node interior except source and target
- Connector path must not cross any label bounding box

---

## THEME REFERENCE

Theme is not part of the diagram JSON spec.
Theme lives in the context document alongside the diagram JSON.
Renderer receives both at draw time and joins them.

Theme structure for reference:

```json
{
  "theme": {
    "name": "string",
    "icon_presentation": "outline | filled | outlined-filled",
    "stroke_width": "number",
    "corner_radius": "number",
    "colors": {
      "infrastructure": "string",
      "application":    "string",
      "messaging":      "string",
      "security":       "string",
      "actor":          "string",
      "brand":          "string",
      "external":       "string",
      "neutral":        "string"
    },
    "text_colors": {
      "infrastructure": "string",
      "application":    "string",
      "messaging":      "string",
      "security":       "string",
      "actor":          "string",
      "brand":          "string",
      "external":       "string",
      "neutral":        "string"
    },
    "connector_color": "string",
    "badge_color":     "string",
    "step_color":      "string"
  }
}
```

---

## FULL EXAMPLE

A minimal two-node diagram: Product Owner creates stories, Jira takes them.

```json
{
  "version": "0.1",
  "diagram": {
    "nodes": [
      {
        "id": "node_001",
        "entity": "node",
        "node_type": "swimlane",
        "name": "layout.swimlane.horizontal",
        "visual_form": "band",
        "theme_category": "neutral",
        "context": { "concept": "Plan phase", "qualifier": null },
        "coordinates": { "x": null, "y": null, "width": null, "height": null },
        "logical": { "lane": null, "group": null, "order": 1 }
      },
      {
        "id": "node_002",
        "entity": "node",
        "node_type": "person",
        "name": "actor.human.owner",
        "visual_form": "circle",
        "theme_category": "actor",
        "context": { "concept": "Product Owner", "qualifier": null },
        "coordinates": { "x": null, "y": null, "width": null, "height": null },
        "logical": { "lane": "node_001", "group": null, "order": 1 }
      },
      {
        "id": "node_003",
        "entity": "node",
        "node_type": "service_box",
        "name": "tool.project.tracker",
        "visual_form": "box",
        "theme_category": "external",
        "context": { "concept": "Jira", "qualifier": "external" },
        "coordinates": { "x": null, "y": null, "width": null, "height": null },
        "logical": { "lane": "node_001", "group": null, "order": 3 }
      }
    ],
    "connectors": [
      {
        "id": "conn_001",
        "entity": "connector",
        "source": "node_002",
        "target": "node_003",
        "style": {
          "line": "dashed",
          "direction": "forward",
          "weight": "normal"
        },
        "semantic": "creates stories in",
        "theme_category": "neutral",
        "coordinates": { "path": null }
      }
    ],
    "labels": [
      {
        "id": "label_001",
        "entity": "label",
        "text": "Plan",
        "label_type": "title",
        "attached_to": "node_001",
        "theme_category": "neutral",
        "style": { "size": "large", "weight": "medium", "align": "left" },
        "coordinates": { "x": null, "y": null, "max_width": null }
      },
      {
        "id": "label_002",
        "entity": "label",
        "text": "Product Owner",
        "label_type": "title",
        "attached_to": "node_002",
        "theme_category": "actor",
        "style": { "size": "normal", "weight": "medium", "align": "center" },
        "coordinates": { "x": null, "y": null, "max_width": null }
      },
      {
        "id": "label_003",
        "entity": "label",
        "text": "Jira",
        "label_type": "title",
        "attached_to": "node_003",
        "theme_category": "external",
        "style": { "size": "normal", "weight": "medium", "align": "center" },
        "coordinates": { "x": null, "y": null, "max_width": null }
      },
      {
        "id": "label_004",
        "entity": "label",
        "text": "Take user stories",
        "label_type": "subtitle",
        "attached_to": "node_003",
        "theme_category": "external",
        "style": { "size": "small", "weight": "regular", "align": "center" },
        "coordinates": { "x": null, "y": null, "max_width": null }
      }
    ],
    "icons": [
      {
        "id": "icon_001",
        "entity": "icon",
        "name": "actor.human.generic",
        "visual_form": "circle",
        "attached_to": "node_002",
        "path_data": "M 50 20 C 38 20 28 30 28 42 C 28 54 38 64 50 64 C 62 64 72 54 72 42 C 72 30 62 20 50 20 Z M 20 95 C 20 75 33 60 50 60 C 67 60 80 75 80 95 Z",
        "viewbox": "0 0 100 100",
        "theme_category": "actor",
        "presentation": null,
        "coordinates": { "x": null, "y": null, "width": null, "height": null },
        "meta": {
          "concept": "human actor",
          "qualifier": "generic",
          "tags": ["person", "user", "human", "actor", "role", "owner"],
          "diagram_contexts": ["system design", "architecture", "devops", "workflow"]
        }
      },
      {
        "id": "icon_002",
        "entity": "icon",
        "name": "tool.project.tracker",
        "visual_form": "box",
        "attached_to": "node_003",
        "path_data": "M 20 10 L 80 10 L 80 90 L 20 90 Z M 30 30 L 70 30 M 30 50 L 70 50 M 30 70 L 55 70",
        "viewbox": "0 0 100 100",
        "theme_category": "external",
        "presentation": null,
        "coordinates": { "x": null, "y": null, "width": null, "height": null },
        "meta": {
          "concept": "project tracking tool",
          "qualifier": "external service",
          "tags": ["jira", "project", "tracker", "tickets", "issues", "board"],
          "diagram_contexts": ["devops", "workflow", "planning", "agile"]
        }
      }
    ],
    "badges": [
      {
        "id": "badge_001",
        "entity": "badge",
        "badge_type": "step",
        "attached_to": "node_002",
        "value": 1,
        "theme_category": "neutral",
        "preferred_position": "top-left",
        "coordinates": { "x": null, "y": null, "radius": null }
      },
      {
        "id": "badge_002",
        "entity": "badge",
        "badge_type": "step",
        "attached_to": "node_003",
        "value": 2,
        "theme_category": "neutral",
        "preferred_position": "top-left",
        "coordinates": { "x": null, "y": null, "radius": null }
      }
    ]
  }
}
```

---

## OPEN DECISIONS (do not implement until resolved)

| ID | Decision | Notes |
|----|----------|-------|
| OD-JS-01 | Icon name vocabulary | Full list of valid {primary_concept}.{qualifier} names — generated from imported icon libraries |
| OD-JS-02 | Theme built-in set | Which themes ship with the product, exact color values |
| OD-JS-03 | Max entities per diagram | Space Manager constraint — total nodes before diagram must be split |
| OD-JS-04 | Connector path format | SVG path string confirmed — exact subset of SVG path commands to support |
| OD-JS-05 | Label max_width computation | Whether Space Manager computes from parent width or canvas width |
| OD-JS-06 | Badge radius sizing rules | Fixed size or computed from value length and theme font size |

---

## DECIDED (safe to implement)

| ID | Decision | Value |
|----|----------|-------|
| D-JS-01 | Top level structure | Five flat arrays: nodes, connectors, labels, icons, badges |
| D-JS-02 | Coordinate assignment | All null from Translation LLM — Space Manager fills all |
| D-JS-03 | Path data location | Stored directly in icon spec — no external registry lookup |
| D-JS-04 | Icon coordinate space | Always 0 0 100 100 — normalized at import |
| D-JS-05 | Icon style in spec | Always null — theme sets presentation at render time |
| D-JS-06 | Text embedding | No text in any non-label spec — all text is a first-class label spec |
| D-JS-07 | Containment | Inferred by Space Manager from logical fields — not declared in spec |
| D-JS-08 | Theme location | Context document — not embedded in diagram JSON |
| D-JS-09 | Canvas coordinate system | 1000 units wide, Y grows downward, Space Manager computes height |
| D-JS-10 | Connector style fields | line (solid/dashed/dotted), direction (forward/backward/bidirectional/none), weight (normal/heavy/light) |
| D-JS-11 | Label max length | 60 characters — Translation LLM enforces this |
| D-JS-12 | Tags per icon | Maximum 8 tags |
| D-JS-13 | Source traceability | No source library, filename, or original color in this spec |
| D-JS-14 | Path transform | Path data transformed from source coordinates at import to break fingerprinting |

---

## INSTRUCTIONS FOR CLAUDE CODE

1. This spec is the contract. Do not add fields not defined here without human approval.

2. Implement in this order:
   a. JSON schema validation — validate a diagram JSON against this spec
   b. Icon spec — path_data, viewbox, meta
   c. Node spec — all node_types
   d. Label spec
   e. Badge spec
   f. Connector spec — path routing is Space Manager concern, just validate fields here
   g. Full diagram JSON assembly and validation

3. The Space Manager fills coordinates. Do not implement coordinate defaults or fallbacks in the spec layer.

4. The Theme fills presentation. Do not implement color defaults in the spec layer.

5. For any OPEN DECISION encountered during implementation, stop and ask the human before proceeding.

6. The full example in this document is the primary test case.
   A correct implementation must parse and validate the example without errors.
