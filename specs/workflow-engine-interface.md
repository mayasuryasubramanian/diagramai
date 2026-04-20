# SPEC: Workflow Engine Interface
**Version:** 0.3
**Status:** Approved
**Depends on:** Plugin Contract spec (v0.4), Diagram JSON spec (v0.4), Space Manager Interface spec (v0.4)
**Blocked by:** ~~OD-02~~ resolved — SVG.

---

## Overview

The Workflow Engine is a **deterministic dispatcher** — not an agent, not an LLM. It receives the Space Manager's output, iterates over every component in a defined order, loads the matching renderer plugin for each, calls its `render` function, and collects the results.

It makes no decisions. It performs no layout. It has no internal state. It is a pure mechanical execution loop.

---

## What the Workflow Engine Must NOT Do

- Make any layout or rendering decisions
- Hold internal state between components or between runs
- Attempt to recover from plugin errors — fail loudly and return a structured error
- Skip components or render them out of order
- Modify the diagram JSON or coordinate map

---

## Input

```ts
type WorkflowEngineInput = {
  diagram:     DiagramJSON;                    // sized DiagramJSON from Space Manager (size fields filled in)
  coordinates: CoordinateMap;                  // output of Space Manager
  canvas:      { width: number; height: number };  // canvas dimensions from Space Manager
  diagram_style: "clean" | "handwritten";      // passed from diagram.diagram_style for convenience
}
```

All fields are passed through from the Space Manager output unchanged. The Workflow Engine does not read `diagram_style` directly from `diagram` — it is surfaced at the top level for clarity.

---

## Processing

### Step 1 — Validate completeness

Before rendering begins, verify:
- Every component `id` in `diagram.components` has a corresponding entry in `coordinates`
- Every component `type` matches a loaded plugin in the registry

Any missing entry is a structured error returned immediately to the Master Agent — rendering does not begin.

### Step 2 — Determine render order

Components are rendered in **topological order**: parents before children.

Algorithm:
1. Build a tree from the `parent` field of each component
2. Traverse depth-first, emitting each node before its children
3. Among siblings (same parent), order is stable and determined by position in the `components` array

This ensures container components (swim lanes, groups) are drawn before their children, so children correctly appear on top.

Render order is fully deterministic: same Diagram JSON always produces the same render sequence.

### Step 3 — Render each component

For each component in render order:

```ts
const plugin      = registry.get(component.type);
const primitives  = plugin.render(component.props, coordinates[component.id]);
```

The `render` call receives:
- `component.props` — the semantic fields from the plugin's schema (no coordinates)
- `coordinates[component.id]` — the pre-computed coordinates from the Space Manager

The renderer is a pure function. The Workflow Engine does not inspect or transform its output — it collects it as-is.

If `render` throws or returns an invalid result, the Workflow Engine stops and returns a structured error to the Master Agent.

---

## Output

```ts
type WorkflowEngineOutput = {
  svg:      string;                  // complete SVG document as a string, ready to display
  rendered: RenderedComponent[];     // in render order (parents before children), for traceability
}

type RenderedComponent = {
  component_id: string;
  svg:          SVGElement | SVGElement[];   // elements returned by the plugin's render fn
}
```

The Workflow Engine composites all rendered elements into a single `<svg>` root using `canvas.width` and `canvas.height` as the viewBox dimensions:

```svg
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 {canvas.width} {canvas.height}"
     width="{canvas.width}" height="{canvas.height}">
  <!-- rendered elements in topological order -->
</svg>
```

- `svg` is the final renderable output — a complete SVG string
- `rendered` retains per-component attribution for the feedback system (component-level click targeting)

---

## Failure Behavior

On any error, the Workflow Engine:

1. Immediately stops processing
2. Returns a `WorkflowEngineError` to the Master Agent
3. Does NOT attempt self-recovery or partial output

```ts
type WorkflowEngineError = {
  stage:            "workflow-engine";
  component_id:     string;         // the component that caused the failure
  plugin_name:      string;         // the plugin that was invoked
  failure_reason:   "missing-plugin" | "missing-coordinates" | "render-error";
  detail:           string;         // description of the specific failure
}
```

---

## Determinism Contract

The Workflow Engine is a **pure function** over its inputs:

- Same `diagram` + same `coordinates` → same `rendered` output, always
- No randomness
- No dependency on external state, time, or execution environment
- Render order is stable and fully determined by the input

---

## Plugin Registry Interaction

- The registry is loaded once at system startup — the Workflow Engine does not reload it mid-run
- Plugin lookup is by `component.type` (must match plugin `name` exactly)
- If a plugin is not found in the registry, this is a `missing-plugin` error — the Workflow Engine does not attempt to find an alternative

---

## Open Items

| ID | Item |
|----|------|
| OD-02 | ~~Resolved — SVG~~ |
| — | CSS `<style>` scoping when compositing multiple plugin SVG outputs into single root — defer to rendering spec |
| — | Whether `RenderedComponent` carries additional metadata (e.g. bounding box) for the feedback UI — defer to feedback UI spec |
