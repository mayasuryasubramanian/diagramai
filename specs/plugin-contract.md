# SPEC: Plugin Contract
**Version:** 0.4
**Status:** Approved
**Depends on:** Nothing (leaf spec)
**Blocked by:** ~~OD-02~~ resolved — SVG. ~~OD-03~~ resolved — JSON Schema draft-07.

---

## Overview

A plugin is a self-contained, stateless module that teaches DiagramAI how to render one component type. Plugins are pure functions — same input always produces same output. They make no layout decisions.

---

## Module Shape

Each plugin is a single file that exports exactly these seven fields:

```ts
interface Plugin {
  name:             string;
  description:      string;
  visual_form:      VisualForm;      // geometric family — used by Space Manager for layout classification
  sizes:            ComponentSizes;  // three guiding sizes for the Space Manager
  schema:           JSONSchema;
  render:           RenderFn;
  feedback_options: string[];        // maximum 6 items
  version:          string;          // semver
}

/**
 * Three guiding sizes the Space Manager uses to determine final component dimensions.
 *
 * stressed  — smallest legible size; used when canvas is tight
 * normal    — default working size; used for initial layout
 * liberal   — spacious size; used when canvas has extra room
 *
 * Connector and overlay plugins (visual_form: "line" | "overlay") set all three to { w: 0, h: 0 }
 * because they have no fixed bounding box — connectors are sized by routing, overlays by content.
 */
interface ComponentSizes {
  stressed: { w: number; h: number };
  normal:   { w: number; h: number };
  liberal:  { w: number; h: number };
}

type VisualForm =
  | "box"        // rectangular, standard aspect ratio
  | "cylinder"   // database, storage
  | "circle"     // actor, person, node
  | "band"       // swimlane, horizontal/vertical stripe
  | "pill"       // compact label, tech tag
  | "diamond"    // decision, branch
  | "cloud"      // external service, network boundary
  | "stack"      // layered resource, replicated service
  | "shield"     // security, trust boundary
  | "line"       // connector, arrow, edge
  | "overlay"    // badge, annotation — attaches to another component
  | "custom";    // Space Manager uses default sizing
```

---

## Field Specifications

### `name: string`
- Unique across the plugin registry (registry rejects duplicates at load time)
- Used in Diagram JSON to reference this component type
- Format: lowercase, hyphen-separated (e.g. `swim-lane`, `decision-box`)
- Immutable once published — renaming is a breaking change

### `visual_form: VisualForm`
- Declares the geometric family of this component
- Used by the Space Manager for **layout classification** (not sizing — sizing comes from `sizes`)
- Does NOT affect rendering — the `render` function draws the component as it sees fit
- Plugin authors must choose the closest matching value; use `"custom"` only when none fit
- `"line"` — for all connector/arrow plugins; Space Manager routes these, no bounding box
- `"overlay"` — for badges, annotations, and any component that attaches to another component

### `sizes: ComponentSizes`
- Three guiding dimensions the Space Manager uses to determine final component bounding boxes
- **Space Manager selects among stressed/normal/liberal** based on how well the overall diagram fits the canvas — it never uses a size outside this range
- `stressed` is the **minimum legible size** — if even stressed sizing cannot fit, the Space Manager extends the canvas and reports a `FitStatus` of `"partial"`
- `liberal` is the **maximum comfortable size** — used when the canvas has available room
- `normal` is the **default starting point** for layout computation
- Values are in abstract canvas units (same coordinate system as the layout)
- Connector and overlay plugins must set all three to `{ w: 0, h: 0 }` (they have no fixed bounding box)
- Content (label text) may cause the Space Manager to produce a final size that is wider than the plugin's guiding size — the guiding sizes are a **floor**, not a cap
- User-confirmed sizes (see Diagram JSON spec: `size.locked = true`) override these guiding sizes entirely

### `description: string`
- Plain English, 1–3 sentences
- Audience: Translation LLM — written to help it decide *when* to use this component
- Must describe what the component represents, not how it renders
- Example: `"A rectangular box representing a process step in a flowchart. Use when the user describes an action, task, or operation."`

### `schema: JSONSchema`
- JSON Schema (draft-07) describing the fields this component accepts
- Audience: Translation LLM — populates these fields from natural language
- May contain nested objects to represent complex component structures
- Must NOT include coordinate fields (`x`, `y`, `width`, `height`) — those are added by the Space Manager
- Must NOT include layout or styling decisions that depend on position
- All fields must have descriptions (the LLM reads them)

### `render: RenderFn`
```ts
type RenderFn = (
  component:     object,         // validated against this plugin's schema
  coordinates: {
    x:      number;
    y:      number;
    width:  number;
    height: number;
    // additional coordinate fields per component type — defined in Space Manager spec
  },
  context: {
    diagram_style: "clean" | "handwritten";  // visual style — plugin adjusts SVG output accordingly
  }
) => SVGElement | SVGElement[]   // one or more SVG elements; no wrapper, no document root
```
- **Pure function** — no side effects, no I/O, no randomness
- **No internal state** — no closures over mutable values, no caches
- **No layout decisions** — must use coordinates exactly as provided; must not reposition, resize, or reflow
- **SVG only** — output is standard SVG elements (`<rect>`, `<path>`, `<circle>`, `<text>`, `<g>`, etc.)
- CSS animations may be embedded directly in the returned elements (via `<style>` scoped to the element or inline `animation` properties) — see Animation Vocabulary below
- `context.diagram_style` tells the plugin which visual treatment to apply — `"clean"` uses precise geometric SVG; `"handwritten"` uses rough/sketchy SVG paths

### `feedback_options: string[]`
- Maximum 6 items; registry rejects plugins with more than 6
- No minimum — a plugin may export fewer than 6 if appropriate
- Each item is a short, specific phrase describing something that can go wrong with *this* component
- Written from the user's perspective (what they would say, not internal system terms)
- Example for a `process-box`: `["Label text is wrong", "Wrong shape used", "Box is in the wrong place", "Missing connection", "Too many connections", "Color is wrong"]`

### `version: string`
- Semver (`MAJOR.MINOR.PATCH`)
- Recorded in the context document alongside the diagram JSON for exact reproduction
- Breaking changes to `schema` or `render` output require a MAJOR version bump

---

## Invariants (enforced by plugin registry at load time)

| Rule | Enforcement |
|------|-------------|
| `name` is unique | Registry rejects duplicate names |
| `name` is lowercase hyphen-separated | Registry rejects on format mismatch |
| `visual_form` is a valid VisualForm value | Registry rejects unknown values |
| `sizes` is present with all three keys | Registry rejects if any key missing |
| `sizes` values are non-negative numbers | Registry rejects negative dimensions |
| `sizes` for `"line"` and `"overlay"` are all zero | Registry warns if non-zero (not a hard error) |
| `feedback_options` has at most 6 items | Registry rejects if count exceeds 6 |
| `version` is valid semver | Registry rejects malformed versions |
| `render` is a function | Registry rejects non-function exports |
| `schema` is valid JSON Schema (draft-07) | Registry validates on load |

---

## Animation Vocabulary

Animations are opt-in per component. Every plugin schema should include an optional `animation` field. The plugin's `render` function outputs SVG with embedded CSS animations when `animation.type` is not `"none"`.

### Standard `animation` prop shape

```ts
type AnimationProp = {
  type:   AnimationType;
  speed:  "slow" | "normal" | "fast";
  repeat: "once" | "loop";
  delay:  number;   // integer seconds, 0 = no delay
}

type AnimationType =
  // Flow — movement along a path (connectors only, visual_form: "line")
  | "flow"       // animated dashes moving in direction of travel
  | "traverse"   // single dot travels along connector path source → target

  // Emphasis — draw attention to a component
  | "pulse"      // rhythmic scale or opacity pulse
  | "glow"       // pulsing shadow/halo around component boundary
  | "highlight"  // single brief flash, then settles

  // Entry — reveal sequence
  | "fade-in"    // component appears from transparent
  | "draw"       // component draws itself — borders/paths trace in

  // State — communicate processing or activity
  | "spin"       // continuous rotation (circle and overlay visual_form only)
  | "blink"      // slow subtle blink — active, waiting, listening

  // Default
  | "none";      // no animation (default for all components)
```

### Rules

- `"none"` is the default — omitting the `animation` field is equivalent to `type: "none"`
- `"flow"` and `"traverse"` are only valid on plugins with `visual_form: "line"`
- `"spin"` is only valid on plugins with `visual_form: "circle"` or `"overlay"`
- A plugin must declare which `AnimationType` values it supports in its schema description
- Unsupported animation types passed to a plugin are silently treated as `"none"` (not an error)
- New animation types may be added in future minor versions — plugins that don't recognise a type fall back to `"none"`

### Speed reference (resolved by theme at render time)

| Speed | Suggested duration |
|-------|--------------------|
| `slow` | 2000ms |
| `normal` | 800ms |
| `fast` | 300ms |

Actual durations are defined in the theme, not hardcoded in plugins.

---

## What Plugins Must NOT Do

- Read or write any external state
- Make HTTP calls or file I/O
- Compute layout (spacing, positioning, sizing)
- Reference other plugins
- Modify the `coordinates` object passed to them

---

## Open Items (do not resolve without human approval)

| ID | Item |
|----|------|
| OD-02 | ~~Resolved — SVG~~ |
| OD-03 | ~~Resolved — JSON Schema draft-07~~ |
| — | Animation speed durations (slow/normal/fast ms values) — resolved by theme spec |
| — | Whether `<style>` blocks in plugin SVG output are scoped or global — defer to rendering/compositing spec |
