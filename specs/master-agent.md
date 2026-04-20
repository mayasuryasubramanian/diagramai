# SPEC: Master Agent
**Version:** 0.3
**Status:** Approved
**Depends on:** All other specs (Plugin Contract v0.4, Diagram JSON v0.4, Space Manager v0.4, Workflow Engine v0.3, Validation Layer v0.2, Layout Pipeline v0.1)
**Resolves:** OD-09 (max retries — configurable)

---

## Overview

The Master Agent is the only stateful component in the system. It owns the session, routes requests through the pipeline, decides which stages to run, handles errors and retries, manages auto-save, and decides when to present output to the user.

All other agents and components are stateless. The Master Agent is the only one that reads and writes session state.

---

## Responsibilities

- Receive user requests (new diagram or natural language correction)
- Determine request type and route accordingly
- Detect whether a correction is structural or props-only, and skip stages that are not needed
- Inject error context into the Translation Agent on validation failure and trigger retries
- Trigger auto-save after every successful validation pass
- Sync to server in background when user is authenticated
- Manage undo by restoring previous saved states
- Escalate to the user when max retries are exceeded

---

## Session State

The Master Agent holds the following in memory for the duration of the session:

```ts
type SessionState = {
  current:       SavedState | null;   // null before first successful draw
  history:       SavedState[];        // ordered oldest-first, for undo
  retry_count:   number;              // reset to 0 after each successful draw
  active_prompt: string;              // the user's current natural language input (for semantic validation)
}

type SavedState = {
  diagram_json:    DiagramJSON;                    // semantic structure, with size fields written in by Space Manager
  coordinate_map:  CoordinateMap;                  // layout — from Space Manager
  canvas:          { width: number; height: number }; // canvas dimensions — from Space Manager
  svg:             string;                         // final rendered output
  instruction:     string;                         // natural language that produced this state
  timestamp:       datetime;
}
```

`SavedState` is what gets persisted to local storage and (when authenticated) synced to the server. It is the complete record needed to display the diagram or re-run the pipeline from any point.

The Master Agent does NOT store:
- Intermediate pipeline outputs (validation results, individual drawing primitives)
- Error history within a retry sequence
- Complex relationship graphs — all semantic structure lives in `diagram_json`

---

## Request Types

### Type 1 — New Diagram
Triggered when there is no `current` state, or the user explicitly starts fresh.

### Type 2 — Correction
Triggered when `current` exists and the user provides a natural language change request.

Corrections are further classified by the Master Agent after receiving the Translation Agent's output:

| Subtype | Definition | Stages skipped |
|---------|-----------|----------------|
| **Structural** | Any component added, removed, type changed, or `parent` changed | None — full pipeline |
| **Props-only** | Same component set and structure, only `props` values changed | Space Manager skipped — existing `coordinate_map` reused |

---

## Pipeline Routing

### New Diagram

```
User input (NL)
    │
    ▼
Translation Agent
(NL → DiagramJSON)
    │
    ▼
Layout Pipeline (see layout-pipeline.md)
  ├── Graph Builder      (DiagramJSON → Graph)
  ├── Geometry Planner   (Graph → DiagramGeometry)
  └── Space Manager      (DiagramGeometry + DiagramJSON → CoordinateMap + canvas)
    │
    ▼
Workflow Engine
(DiagramJSON + CoordinateMap + canvas → SVG string)
    │
    ▼
Validation Layer
(Geometric → Semantic)
    │ PASS
    ▼
Auto-save → Present to user
```

---

### Correction — Structural

```
User input (NL + current DiagramJSON)
    │
    ▼
Translation Agent
(NL + current DiagramJSON → new DiagramJSON)
    │
    ▼
Master Agent: compare old vs new DiagramJSON
→ structural change detected
    │
    ▼
Layout Pipeline        ← full re-run (Graph Builder + Geometry Planner + Space Manager)
    │
    ▼
Workflow Engine
    │
    ▼
Validation Layer
    │ PASS
    ▼
Auto-save → Present to user
```

---

### Correction — Props-only

```
User input (NL + current DiagramJSON)
    │
    ▼
Translation Agent
(NL + current DiagramJSON → new DiagramJSON)
    │
    ▼
Master Agent: compare old vs new DiagramJSON
→ props-only change detected
    │
    ▼
[Layout Pipeline skipped — reuse existing coordinate_map and canvas]
    │
    ▼
Workflow Engine        ← re-run with new props + existing coordinates
    │
    ▼
Validation Layer       ← always runs (text overflow may be affected by prop changes)
    │ PASS
    ▼
Auto-save → Present to user
```

---

## Change Detection

After receiving the Translation Agent's output, the Master Agent classifies the change by comparing old and new DiagramJSON:

**Structural** (full pipeline required) if any of the following differ:
- Set of component `id` values (component added or removed)
- `type` of any component (plugin type changed)
- `parent` of any component (hierarchy changed)

**Props-only** (Space Manager skippable) if:
- Component set is identical (same IDs)
- All `type` values are identical
- All `parent` values are identical
- Only `props` values differ

If classification is ambiguous, treat as structural. Never skip the Space Manager speculatively.

---

## Retry Configuration

All retry limits are configurable in `config/retry.json`. No code change required to adjust values. Defaults are set conservatively and can be tuned based on observed model performance.

```json
{
  "retry_limits": {
    "geometric_overlap_spacing_bounds": 3,
    "geometric_text_overflow":          2,
    "semantic":                         2,
    "json_parse_error":                 3,
    "render_error":                     2,
    "missing_plugin":                   0
  }
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `geometric_overlap_spacing_bounds` | 3 | Overlap, spacing, or canvas bounds failures |
| `geometric_text_overflow` | 2 | Label text overflow only — simpler props fix |
| `semantic` | 2 | Semantic review failures — `suggestion` field assists |
| `json_parse_error` | 3 | Malformed JSON output from Translation Agent |
| `render_error` | 2 | Plugin render function failure |
| `missing_plugin` | 0 | Plugin not registered — escalate immediately, no retry |

`missing_plugin` is always 0 and cannot be overridden — there is no point retrying when the plugin is absent.

---

## Retry Logic

On any validation failure, the Master Agent:

1. Increments `retry_count`
2. Looks up the limit for this error type from `retry_limits` config
3. If under limit: constructs retry input for Translation Agent:
   ```ts
   type RetryInput = {
     original_prompt:   string;           // the user's original request
     current_diagram:   DiagramJSON;      // last valid state
     error:             ValidationError;  // structured error from Validation Layer (includes suggestion on semantic failures)
   }
   ```
4. Routes through the appropriate pipeline (full or props-only, based on error type)
5. If `max_retries` exceeded: escalates to user with the structured error and a plain-language explanation

**Error routing on retry:**

| Error type | Retry pipeline |
|------------|---------------|
| `geometric-validation` — overlap, spacing, canvas bounds | Full pipeline (structural fix likely needed) |
| `geometric-validation` — text-overflow | Props-only pipeline (label text change only) |
| `semantic-validation` — any | Full pipeline (semantic issues may require structural changes) |
| `workflow-engine` — missing-plugin | Escalate immediately — no retry, plugin must be registered |
| `workflow-engine` — render-error | Full pipeline retry |

`retry_count` is reset to 0 after every successful draw (new diagram or correction).

---

## Auto-save

Triggered immediately after every successful validation pass, before presenting output to the user.

```
Validation PASS
    │
    ▼
Construct SavedState {
  diagram_json:   new DiagramJSON (size fields written in by Space Manager),
  coordinate_map: CoordinateMap (new or reused),
  canvas:         { width, height } (new or reused),
  svg:            rendered SVG string,
  instruction:    user's natural language input,
  timestamp:      now
}
    │
    ├──▶ Write to local storage (synchronous, blocking — must complete before user sees output)
    │
    └──▶ If authenticated: sync to server (async, background — does not block user)
```

The user always sees the diagram only after local save has confirmed. Server sync failure does not block or alert the user (silent retry in background).

---

## Undo

Undo restores the previous `SavedState`. No pipeline is re-run — the stored SVG is displayed directly and `current` is updated to the restored state.

```
User requests undo
    │
    ▼
Pop last entry from history[]
    │
    ▼
Set current = popped state
    │
    ▼
Display stored SVG immediately
    │
    ▼
Update local storage (remove last entry)
    │
    └──▶ If authenticated: sync removal to server (async)
```

Undo is only available when `history` has at least one entry. Multiple undo steps are supported (each undo pops one entry). Undo history is bounded by `max_history_depth` (value: TBD — product decision).

Undo history persists across sessions (stored in local storage, synced to server when authenticated).

---

## Storage Format (local + server)

```ts
type PersistedSession = {
  current:  SavedState;
  history:  SavedState[];   // ordered oldest-first
}
```

Both local and server store the same structure. On session start, the Master Agent loads from local storage. If authenticated and server state is newer than local, server state takes precedence.

---

## Session Start Behavior

```
Session starts
    │
    ▼
Load PersistedSession from local storage
    │
    ├── If empty: current = null, history = [], start fresh
    │
    └── If found:
            │
            ├── If authenticated: compare local vs server timestamps
            │       └── Use whichever is newer
            │
            └── Set current + history from loaded state
                Display current SVG to user immediately (no pipeline re-run needed)
```

---

## What the Master Agent Must NOT Do

- Modify DiagramJSON directly — only Translation Agent produces DiagramJSON
- Make layout decisions — Space Manager only
- Render components — Workflow Engine only
- Validate geometry or semantics — Validation Layer only
- Skip validation after any draw (successful or retry)
- Present output to the user before local save has confirmed
- Expose intermediate pipeline state to the user

---

## Open Items

| ID | Item |
|----|------|
| OD-09 | ~~Resolved — configurable via config/retry.json, defaults set~~ |
| — | Max undo history depth — product decision |
| — | Server sync conflict resolution (beyond newer-wins) — defer to backend spec |
| — | Whether user is notified of server sync failure after N background retries — UX decision |
| — | Session recovery UI when loading a previous state — UX/frontend spec |
| — | When layout pipeline becomes async (elkjs/libavoid-js), Master Agent pipeline routing must await the pipeline Promise before proceeding to Workflow Engine |
| — | Whether `fit_status` from Space Manager is surfaced to the user as a non-blocking warning — UX decision |
