# SPEC: Validation Layer
**Version:** 0.3
**Status:** Approved
**Depends on:** Diagram JSON spec (v0.4), Space Manager Interface spec (v0.4), Plugin Contract spec (v0.4)
**Blocked by:** OD-02 (rendering format — does not affect this spec)

---

## Scope

This spec covers the **post-rendering** validation layer only — the two stages (geometric + semantic) that run after the Workflow Engine produces SVG.

For the **pre-pipeline** semantic check that runs between the Translation Agent and the layout pipeline, see `diagram-semantic-validator.md`. The two validators are complementary and serve different purposes:

| | Diagram Semantic Validator | This spec (Validation Layer) |
|---|---|---|
| **When** | After translation, before layout | After rendering |
| **Checks** | Duplicate/conflicting/meaningless relations in JSON | Geometric correctness + intent match of rendered output |
| **On failure** | Retry translation once (capped) | Retry full pipeline via Master Agent |

---

## Overview

The Validation Layer is a two-stage pipeline that runs after the Workflow Engine completes. Stage 1 is deterministic code (geometric). Stage 2 is an LLM (semantic). Stage 2 only runs if Stage 1 passes.

Neither stage attempts self-recovery. Both return structured errors to the Master Agent on failure.

---

## Pipeline Flow

```
Workflow Engine output
        │
        ▼
┌─────────────────────┐
│  Stage 1            │
│  Geometric          │  ──── FAIL ──▶ structured error to Master Agent (Stage 2 skipped)
│  Validator (code)   │
└─────────────────────┘
        │ PASS
        ▼
┌─────────────────────┐
│  Stage 2            │
│  Semantic           │  ──── FAIL ──▶ structured error to Master Agent
│  Reviewer (LLM)     │
└─────────────────────┘
        │ PASS
        ▼
  approved → Master Agent presents output to user
```

---

## Stage 1 — Geometric Validator

### Type
Deterministic code. Not an LLM. Same input always produces same result.

### Input

```ts
type GeometricValidatorInput = {
  diagram:     DiagramJSON;                    // for component structure and label text
  coordinates: CoordinateMap;                  // from Space Manager — all coordinates pre-computed
  canvas:      { width: number; height: number }; // from Space Manager — actual canvas dimensions
}
```

The Geometric Validator does not receive rendered output (drawing primitives). It works from coordinates only.

### Checks (all must pass)

| Check | Rule |
|-------|------|
| **Text overflow** | No label's text content extends beyond its assigned `max_width`. Estimated using character count × average character width for the label's `style.size`. |
| **Component overlap** | No two component bounding boxes intersect. Bounding box is `(x, y, x+width, y+height)` from the coordinate map. Overlay components (`visual_form: "overlay"`) are exempt — they are designed to overlap their parent. |
| **Minimum spacing** | All pairs of non-overlay components separated by at least 40 units. All components at least 40 units from canvas edges. Labels at least 8 units from their parent component's edge. |
| **Arrow routing** | No waypoint segment of any connector intersects the bounding box of any label. Evaluated as line-segment vs rectangle intersection for each consecutive waypoint pair. |
| **Canvas bounds** | Every component's bounding box lies fully within `x ∈ [0, canvas.width]` and `y ∈ [0, canvas.height]`. Both dimensions are the values computed and returned by the Space Manager — **not** hardcoded. The canvas is dynamic: content may extend the initial 1000-unit width. |

### Evaluation order

Checks run in the order listed above. The validator stops at the first failing check and returns a structured error immediately. It does not accumulate multiple failures.

### Output on pass

```ts
type GeometricValidationPass = {
  stage:  "geometric-validation";
  result: "pass";
}
```

### Output on fail

```ts
type GeometricValidationError = {
  stage:               "geometric-validation";
  result:              "fail";
  check_failed:        "text-overflow" | "component-overlap" | "minimum-spacing" | "arrow-routing" | "canvas-bounds";
  components_involved: string[];   // component ids that caused the failure
  detail:              string;     // specific description (e.g. "label_003 extends 12 units beyond max_width")
}
```

Stage 2 is **not triggered** when Stage 1 fails.

---

## Stage 2 — Semantic Reviewer

### Type
LLM. Reviews semantic correctness of the diagram against the user's original intent.

### Precondition
Stage 1 must have passed. Stage 2 is never called directly.

### Input

```ts
type SemanticReviewerInput = {
  diagram:         DiagramJSON;   // full semantic structure — component types, props, labels, relationships
  original_prompt: string;        // the user's natural language input from the current session (provided by Master Agent)
}
```

The Semantic Reviewer does not receive coordinates or drawing primitives — those are geometric concerns already validated by Stage 1.

### Checks

| Check | What the LLM evaluates |
|-------|----------------------|
| **Intent match** | Does the diagram as described in the JSON accurately represent what the user asked for? Are all requested elements present? Are any elements present that were not requested? |
| **Component type appropriateness** | Are the component types (`type` field) semantically correct for the content? E.g. is a decision point represented as a `decision-box` rather than a `process-box`? |
| **Label correctness** | Are labels accurate, clear, and free of contradiction? Do label texts match the components they are attached to? |

### Output on pass

```ts
type SemanticReviewPass = {
  stage:  "semantic-validation";
  result: "pass";
}
```

### Output on fail

```ts
type SemanticReviewError = {
  stage:               "semantic-validation";
  result:              "fail";
  check_failed:        "intent-mismatch" | "wrong-component-type" | "incorrect-label";
  components_involved: string[];   // component ids relevant to the failure (empty if diagram-level issue)
  detail:              string;     // what specifically is wrong
  suggestion:          string;     // what the correct representation should be (used by Master Agent to guide retry)
}
```

---

## Combined Output to Master Agent

```ts
type ValidationResult =
  | { result: "pass" }
  | GeometricValidationError
  | SemanticReviewError;
```

On pass: Master Agent presents the diagram output to the user.
On fail: Master Agent injects the structured error into the Translation Agent context and triggers a retry.

---

## What the Validation Layer Must NOT Do

- Trigger Stage 2 when Stage 1 has failed
- Attempt to fix errors — return structured errors only
- Make layout decisions or modify coordinates
- Access session history or version log — it receives only what is listed in its inputs
- Accumulate multiple errors — stop at first failure in Stage 1; return single error from Stage 2

---

## Open Items

| ID | Item |
|----|------|
| OD-02 | ~~Resolved — SVG~~ |
| OD-09 | Maximum retry count before Master Agent escalates to user — DEFERRED |
| — | Character width estimation method for text overflow check — needs font metrics, defer to implementation |
| — | Whether Stage 2 LLM receives diagram as JSON or as a natural language summary of the JSON — implementation detail |
| — | Whether Stage 2 receives the full version history or only the current prompt — defer to Master Agent spec |
