# DIAGRAMAI — MACHINE-READABLE DESIGN DOCUMENT
# Version: 0.1
# Stage: Design (pre-specification)
# Audience: Claude Code — use this document to generate specifications and implementation plans
# Do NOT generate code from this document directly — generate specs first, get human approval, then code

---

## DOCUMENT PURPOSE

This document describes the complete system design of DiagramAI.
It contains all decisions made during the design stage.
It explicitly flags what is NOT yet decided.
When asked to generate specifications, use only what is marked DECIDED.
When asked about anything marked DEFERRED or OPEN, ask the human before proceeding.

---

## SYSTEM IDENTITY

name: DiagramAI
type: AI-powered diagram generation tool
target_user: technical bloggers, content creators
core_interaction_model: natural language in, diagram out, corrections via natural language only
no_manual_editing: true
reason: manual layout produces unbalanced diagrams

---

## ARCHITECTURE PATTERN

pattern: multi-agent pipeline with deterministic workflows
coordination: master agent
state_owner: master agent (all other agents are stateless)
pipeline_direction: linear with retry loops on failure

pipeline_stages:
  1. user_input (natural language)
  2. translation_agent (NL → Diagram JSON)
  3. space_manager_agent (Diagram JSON → Diagram JSON + coordinates)
  4. workflow_engine (dispatches to renderer plugins)
  5. validation_layer (geometric then semantic)
  6. output (final diagram)
  7. feedback_collection (draft mode, component level)

---

## AGENTS

### MASTER_AGENT
type: agent (reasoning, decision-making)
responsibilities:
  - receive user requests (new diagram or correction)
  - route requests to appropriate agents
  - manage version_log
  - manage context_document
  - handle errors and trigger retries
  - decide when to present output to user
state: holds full session state
stateless: false
notes:
  - all other agents are stateless
  - master agent is the only agent that reads/writes version_log and context_document

### TRANSLATION_AGENT
type: agent (local LLM, specialized)
llm_type: local, small, fine-tuned
task: convert natural language to Diagram JSON
input:
  - natural_language_prompt: string
  - current_diagram_json: object | null  # null on first request, populated on corrections
  - plugin_registry_schema: object  # injected at runtime — all plugin names, descriptions, schemas
output:
  - diagram_json: object  # valid against Diagram JSON spec (spec TBD)
training:
  - continuously trained on human-approved feedback
  - feedback must pass human_reviewer_gate before entering training pipeline
  - no automated feedback in training pipeline
knowledge_scope:
  - knows: plugin names, descriptions, schemas (injected)
  - does NOT know: coordinates, rendering, canvas size

### SPACE_MANAGER_AGENT
type: agent (algorithmic, NOT LLM)
task: compute layout — assign coordinates to every component
input:
  - diagram_json: object  # semantic, no coordinates
output:
  - diagram_json_with_coordinates: object  # same structure + coordinate fields on every component
constraints_enforced:
  - minimum spacing between components
  - minimum padding inside containers
  - no overlapping components
  - arrow paths must not cross labels
  - all components within canvas bounds
on_failure:
  - return structured_error to master_agent
  - do NOT attempt self-recovery
  - error must specify: which constraint failed, which components are involved

### WORKFLOW_ENGINE
type: workflow (deterministic dispatcher, NOT an agent)
task: execute renderer plugin for each component
input: diagram_json_with_coordinates (one component at a time)
output: drawing_primitives (SVG elements or canvas calls — output format TBD)
plugin_loading: reads component type from JSON, loads matching plugin from registry
purity_requirement: renderer plugins must be pure functions
  - same input always produces same output
  - no internal state
  - no layout decisions
on_failure:
  - return structured_error to master_agent
  - do NOT attempt self-recovery

### VALIDATION_LAYER
type: two-stage pipeline (code first, LLM second)
stage_1:
  name: geometric_validator
  type: deterministic code (NOT LLM)
  checks:
    - text overflow: no text extends beyond its bounding box
    - component overlap: no two components intersect
    - minimum spacing: all spacing constraints met
    - arrow routing: no arrow path intersects a label
    - canvas bounds: all coordinates within canvas dimensions
  on_pass: trigger stage_2
  on_fail: return structured_error to master_agent, do NOT trigger stage_2

stage_2:
  name: semantic_reviewer
  type: LLM
  precondition: stage_1 must have passed
  checks:
    - diagram accurately represents user intent
    - component types are appropriate for content
    - labels are correct and clear
  on_pass: return approved to master_agent
  on_fail: return structured_error to master_agent

---

## PLUGIN ARCHITECTURE

### PLUGIN_CONTRACT
every plugin exports exactly these fields:
  name: string  # unique identifier, used in Diagram JSON to reference this component
  description: string  # plain English, read by Translation LLM to know when to use this component
  schema: object  # JSON schema this component accepts — Translation LLM populates fields from this
  render: function  # signature: (component_json: object, coordinates: object) => drawing_primitives
  feedback_options: string[]  # exactly 5-6 items, specific to what can go wrong with this component
  version: string  # semver, used in context_document for reproducibility

plugin_is_pure_function: true
plugin_has_no_internal_state: true
plugin_makes_no_layout_decisions: true

### PLUGIN_REGISTRY
type: directory of registered plugins
loaded_at: system startup
on_load:
  1. read all plugins from registry directory
  2. build plugin_registry_schema (all names + descriptions + schemas)
  3. inject plugin_registry_schema into Translation Agent context
extension_mechanism: add new plugin file + register = done, no core code changes

### PLUGIN_RENDERER_CONTRACT
render function receives:
  component_json: object  # fields as defined in plugin schema
  coordinates: object  # always provided by space_manager, never computed by renderer
    required_fields:
      - x: number
      - y: number
      - width: number
      - height: number
      - (additional fields per component type — TBD in spec stage)
render function returns: drawing_primitives  # format TBD (SVG elements, canvas calls, etc.)

### SYMBOL_IMPORT_TOOL
purpose: convert external SVG/image symbols into renderer plugins
input: single bounded symbol (SVG or image file)
process:
  1. vision LLM analyzes symbol
  2. extracts shape, structure, colors
  3. generates renderer plugin code
  4. registers in plugin registry
scope_constraint: single symbols only — NOT full diagrams
rationale: full diagram reconstruction from images is unreliable at this stage

---

## DIAGRAM JSON

status: SPECIFIED — see dedicated spec document
spec_document: DiagramAI-JSON-Spec.md
do_not_redefine_here: true

summary:
  - five flat arrays: nodes, connectors, labels, icons, badges
  - every entity is first-class — no entity embeds another
  - all coordinates null from Translation LLM — Space Manager fills all
  - path data stored directly in icon spec — no external registry lookup
  - all text is a first-class label spec — no text embedded in other specs
  - containment inferred by Space Manager from logical fields
  - theme lives in context document — not embedded in diagram JSON
  - canvas: 1000 units wide, Y grows downward, height computed by Space Manager

---

## CONTEXT DOCUMENT

purpose: portable, shareable record for exact diagram reproduction
portability: any machine running DiagramAI with correct plugins can reproduce the diagram

contents:
  INCLUDED:
    - diagram_json: object  # final approved version only
    - plugin_versions: map<plugin_name, semver>  # or plugin registry URL
    - tool_version: string
  EXCLUDED:
    - natural_language_prompts  # personal, not reproducible across users
    - intermediate_versions  # internal only
    - error_history  # separate log, not part of context
    - coordinates  # recomputed at render time by space_manager

sharing_flow:
  1. user shares context_document file
  2. recipient opens in local DiagramAI installation
  3. tool checks all plugin_versions in document
  4. if plugin missing:
       - fail loudly with clear error message
       - include link to plugin repository
       - do NOT attempt to render with missing plugins
  5. if all plugins present: render identically

plugin_distribution_strategy: DEFERRED (business model decision)
current_behavior_on_missing: fail + repo link

---

## VERSION LOG

type: session-local, NOT shared
managed_by: master_agent
entry_structure:
  - diagram_json_snapshot: object
  - natural_language_instruction: string
  - validation_results: object
  - timestamp: datetime
purpose:
  - enables undo
  - provides master agent with session history
scope: session-local only, never included in context_document

---

## CORRECTION FLOW

trigger: user provides natural language correction
pipeline: identical to new diagram pipeline
difference: Translation Agent receives current_diagram_json as additional input
result: new version appended to version_log, context_document updated to new version

example:
  input: "Change the Plan lane to blue"
  master_agent_action: pass (current_diagram_json + "Change the Plan lane to blue") to Translation Agent
  output: updated diagram_json with Plan lane color changed
  no_special_edit_mode: true

---

## FEEDBACK SYSTEM

### COLLECTION (component level, draft mode only)
per_component_ui:
  element_1:
    type: thumbs_up_down
    visibility: always_visible
    triggers: none on thumbs_up / shows element_2 on thumbs_down
  element_2:
    type: structured_options
    source: plugin.feedback_options  # loaded from the component's plugin definition
    max_options: 6
    visibility: shown after thumbs_down
  element_3:
    type: free_text
    visibility: shown after element_2
    required: false

### PROCESSING PIPELINE
stages:
  1:
    name: normalization
    type: LLM
    input: raw feedback (thumb + selected options + free text)
    output: structured feedback record with category tags
    task: map free text to categories, reconcile with selected options
  2:
    name: aggregation_store
    type: database
    behavior: collect until threshold met (threshold TBD)
  3:
    name: human_reviewer_gate
    type: human review
    input: aggregated patterns (not individual items)
    decision: approve or reject for training
    rationale: human-only signal, prevents model drift
  4:
    name: training_pipeline
    type: fine-tuning
    target: Translation LLM
    input: human-approved structured feedback records
    tagging: feedback tagged by component_type for isolation

### RULES
human_only_training: true
automated_feedback_in_training: false
single_thumbs_down_triggers_retraining: false
contradictory_feedback_handling: flag for human review, do not auto-resolve

---

## ERROR HANDLING

### RETRY STRATEGY
managed_by: master_agent
on_validation_failure:
  - master_agent receives structured_error from validation_layer
  - structured_error contains: stage_failed, constraint_violated, components_involved
  - master_agent retries with error context injected into Translation Agent
  - max_retries: TBD in spec stage

### ERROR LOG (separate from version_log and context_document)
purpose: train system to avoid repeating errors
contents: validation errors + resolutions
used_for: fine-tuning (separate pipeline from user feedback)
NOT_included_in: context_document, version_log

---

## OPEN DECISIONS (do not implement until resolved)

| ID | Decision | Status | Notes |
|----|----------|--------|-------|
| OD-01 | Diagram JSON specification | DEFERRED | Generate in spec stage |
| OD-02 | Rendering output format | DEFERRED | SVG vs Canvas vs both |
| OD-03 | Plugin schema format | DEFERRED | Part of Diagram JSON spec |
| OD-04 | Space manager algorithm | DEFERRED | Constraint solver approach TBD |
| OD-05 | Specific LLM model selection | DEFERRED | Candidates: Qwen2.5-Coder, DeepSeek-Coder, Phi-3 |
| OD-06 | Fine-tuning approach | DEFERRED | Continuous online training, human gate required |
| OD-07 | Feedback aggregation threshold | DEFERRED | Minimum signal before human review |
| OD-08 | Plugin repository infrastructure | DEFERRED | Business model decision |
| OD-09 | Max retries on validation failure | DEFERRED | Spec stage |
| OD-10 | Canvas size and coordinate system | DEFERRED | Part of space manager spec |

---

## DECIDED (safe to implement or specify)

| ID | Decision | Value |
|----|----------|-------|
| D-01 | Diagram language type | machine-only, not human-writable |
| D-02 | Correction mechanism | natural language only, no manual editing |
| D-03 | Training signal | human-approved only |
| D-04 | Missing plugin behavior | fail loudly + link to plugin repo |
| D-05 | Natural language in shared context | excluded |
| D-06 | Coordinates in shared context | excluded, recomputed at render time |
| D-07 | Feedback granularity | component level, not diagram level |
| D-08 | Renderer plugins are pure functions | true, no internal state, no layout decisions |
| D-09 | Space manager type | algorithmic, NOT LLM |
| D-10 | Geometric validation | code, NOT LLM |
| D-11 | Semantic validation (post-rendering) | LLM, runs only after geometric validation passes |
| D-12 | Plugin contract fields | name, description, schema, render, feedback_options, version |
| D-13 | Error history in context document | excluded |
| D-14 | Coordinates in semantic diagram JSON | excluded, added by space manager in separate pass |
| D-15 | Pre-pipeline semantic validation | LLM, runs after translation before layout — catches duplicate/conflicting/meaningless relations in DiagramJSON before any rendering work begins. Implemented as Diagram Semantic Validator (see specs/diagram-semantic-validator.md) |
| D-16 | Pre-pipeline validator failure behaviour | fail-open — if the validator itself cannot run, the diagram proceeds to layout unchanged. The validator never blocks the pipeline. |
| D-17 | Pre-pipeline correction loop cap | exactly one correction attempt per diagram — the corrected output is never re-validated, preventing infinite loops |

---

## INSTRUCTIONS FOR CLAUDE CODE

When working with this document:

1. For specification generation: use DECIDED items only. For each DEFERRED item, ask the human before generating any spec.

2. For implementation: never implement anything marked DEFERRED. Ask first.

3. For the Diagram JSON spec: start by proposing a minimal schema covering only what is DECIDED (component reference by plugin name, no coordinates). Present to human before expanding.

4. For the plugin contract spec: the four fields (name, description, schema, render, feedback_options, version) are fully decided. Specify these first.

5. For the space manager: algorithm is DEFERRED. You may spec the interface (inputs and outputs) since those are decided, but not the internal algorithm.

6. Suggest what to tackle in this order:
   a. Plugin contract spec (most decided, least dependencies)
   b. Diagram JSON spec (depends on plugin contract)
   c. Space manager interface spec (inputs/outputs only)
   d. Workflow engine interface spec
   e. Validation layer spec
   f. Master agent spec (most complex, depends on all others)

7. This document is the source of truth for design decisions. If the human's instruction conflicts with this document, flag the conflict before proceeding.
