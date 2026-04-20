import type { DiagramJSON } from '../types'

// CI/CD pipeline across 4 lanes — strictly left-to-right, no back-edges
const swimLaneComplex: DiagramJSON = {
  diagramai_version: '0.1',
  diagram_style: 'clean',
  components: [
    // Lanes
    { id: 'lane-dev',     type: 'swim-lane', props: { label: 'Developer',   theme_category: 'actor'          }, parent: null },
    { id: 'lane-ci',      type: 'swim-lane', props: { label: 'CI / GitHub', theme_category: 'application'    }, parent: null },
    { id: 'lane-staging', type: 'swim-lane', props: { label: 'Staging',     theme_category: 'infrastructure' }, parent: null },
    { id: 'lane-prod',    type: 'swim-lane', props: { label: 'Production',   theme_category: 'security'       }, parent: null },

    // Developer lane
    { id: 'push-01',   type: 'process-box',  props: { label: 'Push Code',    theme_category: 'actor'       }, parent: 'lane-dev' },
    { id: 'pr-01',     type: 'process-box',  props: { label: 'Open PR',      theme_category: 'actor'       }, parent: 'lane-dev' },

    // CI lane
    { id: 'lint-01',   type: 'process-box',  props: { label: 'Lint & Build', theme_category: 'application' }, parent: 'lane-ci' },
    { id: 'test-01',   type: 'decision-box', props: { label: 'Tests Pass?',  theme_category: 'neutral'     }, parent: 'lane-ci' },
    { id: 'artifact',  type: 'process-box',  props: { label: 'Build Artifact',theme_category: 'application' }, parent: 'lane-ci' },
    { id: 'fail-01',   type: 'process-box',  props: { label: 'Notify Failure',theme_category: 'security'   }, parent: 'lane-ci' },

    // Staging lane
    { id: 'deploy-stg',type: 'process-box',  props: { label: 'Deploy Staging',   theme_category: 'infrastructure' }, parent: 'lane-staging' },
    { id: 'smoke-01',  type: 'decision-box', props: { label: 'Smoke Tests OK?',  theme_category: 'neutral'        }, parent: 'lane-staging' },
    { id: 'rollback',  type: 'process-box',  props: { label: 'Rollback',         theme_category: 'security'       }, parent: 'lane-staging' },

    // Production lane
    { id: 'approve-01',type: 'process-box',  props: { label: 'Manual Approval',  theme_category: 'security'       }, parent: 'lane-prod' },
    { id: 'deploy-prd',type: 'process-box',  props: { label: 'Deploy Production',theme_category: 'infrastructure' }, parent: 'lane-prod' },
    { id: 'monitor-01',type: 'process-box',  props: { label: 'Monitor & Alert',  theme_category: 'infrastructure' }, parent: 'lane-prod' },

    // Arrows — within-lane
    { id: 'a-01', type: 'arrow', props: { from: 'push-01',    to: 'pr-01'      }, parent: null },
    { id: 'a-02', type: 'arrow', props: { from: 'lint-01',    to: 'test-01'    }, parent: null },
    { id: 'a-03', type: 'arrow', props: { from: 'test-01',    to: 'artifact',  label: 'pass' }, parent: null },
    { id: 'a-04', type: 'arrow', props: { from: 'test-01',    to: 'fail-01',   label: 'fail', style: { line: 'dashed' } }, parent: null },
    { id: 'a-05', type: 'arrow', props: { from: 'deploy-stg', to: 'smoke-01'  }, parent: null },
    { id: 'a-06', type: 'arrow', props: { from: 'smoke-01',   to: 'rollback',  label: 'fail', style: { line: 'dashed' } }, parent: null },
    { id: 'a-07', type: 'arrow', props: { from: 'approve-01', to: 'deploy-prd'}, parent: null },
    { id: 'a-08', type: 'arrow', props: { from: 'deploy-prd', to: 'monitor-01'}, parent: null },

    // Arrows — cross-lane
    { id: 'a-09', type: 'arrow', props: { from: 'pr-01',      to: 'lint-01'   }, parent: null },
    { id: 'a-10', type: 'arrow', props: { from: 'artifact',   to: 'deploy-stg'}, parent: null },
    { id: 'a-11', type: 'arrow', props: { from: 'smoke-01',   to: 'approve-01', label: 'pass' }, parent: null },
  ],
}

export default swimLaneComplex
