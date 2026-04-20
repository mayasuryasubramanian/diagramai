# SPEC: Diagram Semantic Validator
**Version:** 0.1
**Status:** Approved
**Depends on:** Diagram JSON spec (v0.4), Translation Agent spec (v0.2)

---

## Overview

The Diagram Semantic Validator is a pre-pipeline LLM check that runs **after** the Translation Agent produces a structurally valid Diagram JSON and **before** it enters the layout pipeline.

It is distinct from the post-pipeline Validation Layer (see `validation-layer.md`):

| | Diagram Semantic Validator | Validation Layer |
|---|---|---|
| **When** | After translation, before layout | After rendering |
| **What** | Semantic correctness of the JSON spec | Geometric correctness + intent match of the rendered output |
| **Input** | DiagramJSON | DiagramJSON + CoordinateMap + SVG |
| **On failure** | Retry translation once with issues injected | Retry full pipeline via Master Agent |

---

## Responsibility

Catch three categories of semantic problems in a freshly generated DiagramJSON before any layout or rendering work is done:

| Issue type | What it catches |
|---|---|
| `duplicate_relation` | Two arrows expressing the same relationship between the same components, even if they have different IDs or slightly different labels. Example: `api-gw → auth-svc` appearing as both "verify" and "authenticate" arrows. |
| `conflicting_relation` | Arrows that contradict each other or assign incompatible roles to a component. Example: `A → B "sends data"` and `B → A "sends data"` both present when only one direction makes sense. Example: a CDN node that also appears as the target of a database write. |
| `meaningless_spec` | A connection that is architecturally nonsensical given the component labels and types. Example: a mobile app writing directly to a message queue with no backend service. Example: a start node with incoming arrows. Example: an isolated node with no connections in a flow diagram. |

The validator does NOT:
- Check coordinates or layout (those don't exist yet)
- Evaluate whether the diagram matches the user's intent (that is Stage 2 of the Validation Layer)
- Attempt to fix issues — it returns a structured list; the Translation Agent handles correction

---

## Position in the Pipeline

```
Translation Agent
  → parseAndValidate()        ← structural check (JSON syntax, components array, dedup)
  → validateDiagram()         ← this component
      │ ok   → layout pipeline
      │ issues found:
          → buildCorrectionPrompt(issues)
          → Translation Agent retry (once)
          → layout pipeline (with corrected or original diagram)
```

---

## Input

```ts
type DiagramValidatorInput = DiagramJSON   // structurally valid — passed directly from parseAndValidate
```

---

## Output

```ts
type DiagramValidationResult =
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] }

type ValidationIssue = {
  type:         'duplicate_relation' | 'conflicting_relation' | 'meaningless_spec';
  description:  string;        // plain English — used verbatim in correction prompt
  affected_ids: string[];      // component IDs involved
}
```

---

## LLM Call

### Primary: Ollama (qwen3:8b)

Same Ollama instance as Translation Agent.

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `model` | `qwen3:8b` | Reuses existing local model — no additional model required |
| `think` | `false` (top-level) | Disables extended thinking; verdict is simple classification, not reasoning-heavy |
| `temperature` | `0.1` (first attempt), `0` (retry) | Deterministic for classification tasks |
| `num_predict` | `512` | Verdict JSON is small — cap tokens for speed |
| `format` | `"json"` | Forces valid JSON output |

### Fallback: Anthropic Haiku

If Ollama is unreachable or both attempts fail to produce a parseable verdict, the validator falls back to `claude-haiku-4-5-20251001` via the Anthropic API.

Haiku is used (not Opus/Sonnet) because validation is a short structured classification task — the cheapest capable model is appropriate.

### Fail-open behaviour

If the validator itself fails after all attempts (model unreachable, unparseable response), it returns `{ ok: true }` and logs a warning to the console. **The validator never blocks the pipeline.** A failed validator is treated as "no issues found" — the diagram proceeds to layout unchanged.

---

## Prompt Design

### System prompt

The validator is given a focused system prompt that lists exactly three issue types with concrete examples and instructs the model to return `{"valid": true}` when no issues are found.

Key constraints in the system prompt:
- "Only report real problems. Do not invent issues."
- "Respond with ONLY a JSON object — no explanation, no markdown"
- Output schema is specified exactly, including both the passing and failing cases

### User message

```
Validate this DiagramJSON:
<full DiagramJSON as formatted JSON>
```

---

## Loop Prevention

The correction loop runs **at most once** per diagram:

```
validate → issues → retry translate → accept result (no re-validation)
```

The corrected diagram is never re-validated. This is intentional — re-validating would risk an infinite loop if the correction introduces a new issue. The hard cap is 2 extra LLM calls (1 validator + 1 correction) per translation attempt.

---

## Implementation

**File:** `src/agent/diagram-validator.ts`

Exports:
- `validateDiagram(diagram: DiagramJSON): Promise<DiagramValidationResult>`
- `ValidationIssue` type
- `DiagramValidationResult` type
- `IssueType` union type

The validator is called from `translation-agent.ts` inside the `runSemanticValidation` helper, which is invoked after every successful `parseAndValidate` call.

---

## Open Items

| ID | Item |
|----|------|
| — | Whether validation issues should be surfaced to the user as a non-blocking info message (e.g. "1 duplicate relation was automatically fixed") — UX decision |
| — | Whether to add a `severity` field to `ValidationIssue` to distinguish hard errors from warnings |
| — | Whether the validator should also check for missing required relationships (e.g. orphan nodes in a flow diagram) |
| — | Threshold for when a diagram is too large to validate economically (token budget) |
