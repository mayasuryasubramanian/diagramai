// Validation types — from validation-layer spec v0.3

export interface WorkflowEngineError {
  stage: 'workflow-engine'
  component_id: string
  plugin_name: string
  failure_reason: 'missing-plugin' | 'missing-coordinates' | 'render-error'
  detail: string
}
