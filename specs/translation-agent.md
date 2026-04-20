# SPEC: Translation Agent
**Version:** 0.2
**Status:** Approved
**Depends on:** Plugin Contract spec (v0.4), Diagram JSON spec (v0.3), Diagram Semantic Validator spec (v0.1)
**Resolves:** OD-05 (LLM model selection)

---

## Overview

The Translation Agent converts natural language into Diagram JSON. It is the only component in the pipeline that uses an LLM for generation. It is stateless — all session context is provided by the Master Agent on each call.

---

## Model

**qwen3:8b** running locally via **Ollama** at `http://localhost:11434`.

| Property | Value |
|----------|-------|
| Model | qwen3:8b |
| Quantisation | Q4_K_M (default Ollama download) |
| Runtime | Ollama |
| VRAM required | ~5GB |
| Typical response time | 15–25s on Apple Silicon (M1/M2/M3) |

### Extended Thinking Mode

qwen3 has an extended thinking mode that generates internal reasoning tokens before producing output. This must be **disabled** for the translation use case:

- Extended thinking consumes thousands of tokens internally, exhausting the `num_predict` budget before the diagram JSON is complete
- The thinking mode option must be passed as a **top-level field** in the Ollama request body — setting it inside `options` has no effect
- Correct: `{ "model": "qwen3:8b", "think": false, ... }`
- Incorrect: `{ "model": "qwen3:8b", "options": { "think": false, ... } }`

### Cloud Fallback

If Ollama is unreachable or the local model fails after retries, the agent falls back to **Anthropic Claude** when `VITE_ANTHROPIC_API_KEY` is set in the environment. Current fallback model: `claude-opus-4-6`.

---

## Why qwen3:8b

- Reliable structured JSON output under `format: "json"` constraint
- Runs on consumer hardware without a GPU
- Apache 2.0 license — commercial use permitted
- Fast enough for interactive use (~20s per diagram at Q4_K_M)

---

## Responsibilities

- Convert natural language to valid Diagram JSON (new diagram)
- Apply natural language corrections to existing Diagram JSON (correction flow)
- Assign `diagram_type`, `diagram_style`, `theme_category`, and connector style fields
- Never assign coordinates — those belong to the Space Manager

The Translation Agent does NOT:
- Compute layout or positions
- Know about canvas size or coordinate system
- Retain state between calls — all context is injected per call

---

## Input

Two call types:

### Type 1 — New Diagram

```ts
type NewDiagramInput = {
  prompt:          string;               // user's natural language request
  plugin_registry: PluginRegistrySchema; // all plugin names, descriptions, schemas — injected at call time
  examples?:       TrainingExample[];    // top-N relevant examples from training store (few-shot)
}
```

### Type 2 — Correction

```ts
type CorrectionInput = {
  prompt:          string;               // user's natural language correction
  current_diagram: DiagramJSON;          // current diagram state from Master Agent session
  plugin_registry: PluginRegistrySchema;
  semantic_issues?: ValidationIssue[];   // present on semantic correction retry — from Diagram Semantic Validator
}
```

When `semantic_issues` is present, the issues are injected into the user prompt as a plain-English correction list. The Translation Agent uses them to fix specific failures.

### PluginRegistrySchema

```ts
type PluginRegistrySchema = {
  plugins: Array<{
    name:                 string;
    description:          string;
    visual_form:          string;
    schema:               JSONSchema;
    supported_animations: AnimationType[];
  }>
}
```

---

## Output

```ts
type TranslationAgentOutput = {
  diagram_json: DiagramJSON;   // complete, valid Diagram JSON — no coordinates
  source: 'local' | 'fallback';
}
```

---

## Generation + Validation Flow

```
User description
       │
       ▼
Retrieve top-3 training examples (TF-IDF keyword overlap)
Build user prompt with injected examples
       │
       ▼
Attempt 1 — callOllama(prompt, temperature=0.3)
  │ ok → parseAndValidate()
  │         ├── ok → runSemanticValidation()   ← see below
  │         └── fail → continue
  │ fail (unreachable) → skip Attempt 2
       │
       ▼
Attempt 2 — callOllama(prompt + stricter instructions, temperature=0.1)
  │ ok → parseAndValidate()
  │         ├── ok → runSemanticValidation()
  │         └── fail → continue
       │
       ▼
Attempt 3 — callAnthropic(prompt) [only if VITE_ANTHROPIC_API_KEY set]
  │ ok → parseAndValidate()
  │         ├── ok → runSemanticValidation()
  │         └── fail → return error
       │
       ▼
Return error ("Cannot reach Ollama" if unreachable, otherwise generic)
```

### Semantic Validation Sub-flow (runSemanticValidation)

```
structurally valid DiagramJSON
       │
       ▼
validateDiagram()   ← Diagram Semantic Validator (separate LLM call)
  │ ok   → return diagram
  │ issues found:
       │
       ▼
buildCorrectionPrompt(originalPrompt, issues)
       │
       ▼
callOllama(correctionPrompt, temperature=0.1)  ← one correction attempt
  │ ok → parseAndValidate()
  │       ├── ok → return corrected diagram
  │       └── fail → return original diagram (no re-validation to prevent loops)
  │ fail → return original diagram
```

**Loop prevention:** the correction attempt is made exactly once. The corrected diagram is never re-validated. In the worst case the pipeline runs 2 LLM calls (validator + one correction) before exiting.

---

## parseAndValidate (Structural Validation)

Runs on every raw model response. Steps in order:

1. Strip markdown fences (model sometimes adds them despite instructions)
2. Parse JSON; if it fails, extract first `{...}` block and retry
3. Check `components` is an array
4. Apply default `diagramai_version: "0.1"` and `diagram_style: "clean"` if absent
5. **Deduplicate arrows**: remove any arrow component whose `from→to` pair already appeared earlier in the array. Keeps the first occurrence. Handles the case where the model emits the same relationship twice with different IDs.

---

## Few-Shot Training Examples

The training store provides up to 3 relevant examples per request, selected by TF-IDF keyword overlap between the user description and stored example descriptions.

Two tiers:
- **Seed examples** (hard-coded): cover core component types and diagram patterns
- **Learned examples** (localStorage): added when users successfully generate and accept a diagram

Learned examples are stored in `localStorage` under the key `diagramai:training-examples` and persist across sessions.

---

## Fine-Tuning (Future)

The Translation Agent is designed for continuous improvement through human-approved feedback.

- **Method**: LoRA (Low-Rank Adaptation) — efficient fine-tuning without full retraining
- **Training signal source**: user thumbs-down feedback, normalised by LLM, reviewed by human gate before entering training pipeline
- **No automated feedback in training** — human approval is mandatory (D-03)
- **Tagged by component type** — fine-tuning is targeted, not broad

Fine-tuning details (batch size, learning rate, adapter rank, training schedule) are deferred to the ML engineering spec.

---

## Statelessness

The Translation Agent holds no state between calls. Every input is self-contained — the caller provides all necessary context (current diagram, plugin registry, issues) on each invocation. Each call is independent and reproducible given the same inputs.

---

## Open Items

| ID | Item |
|----|------|
| OD-05 | ~~Resolved — qwen3:8b via Ollama, cloud fallback to claude-opus-4-6~~ |
| OD-06 | Fine-tuning details — batch size, learning rate, LoRA rank, training schedule — defer to ML engineering spec |
| OD-07 | Feedback aggregation threshold — minimum signal before human review gate — DEFERRED |
| — | Hardware detection and automatic model variant selection (1.5B / 7B / 14B) — deferred to deployment spec |
| — | System prompt versioning strategy — how to manage prompt changes across deployed sessions |
