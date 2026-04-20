import type { DiagramJSON } from '../types'

// Software delivery process across three teams
const swimLane: DiagramJSON = {
  diagramai_version: '0.1',
  diagram_type: 'swim-lane',
  diagram_style: 'clean',
  components: [
    // Lanes
    {
      id: 'lane-plan',
      type: 'swim-lane',
      props: { label: 'Plan', theme_category: 'neutral' },
      parent: null,
    },
    {
      id: 'lane-build',
      type: 'swim-lane',
      props: { label: 'Build', theme_category: 'application' },
      parent: null,
    },
    {
      id: 'lane-ship',
      type: 'swim-lane',
      props: { label: 'Ship', theme_category: 'infrastructure' },
      parent: null,
    },
    // Plan lane children
    {
      id: 'spec-01',
      type: 'process-box',
      props: { label: 'Write Spec', theme_category: 'neutral' },
      parent: 'lane-plan',
    },
    {
      id: 'design-01',
      type: 'process-box',
      props: { label: 'Design API', theme_category: 'neutral' },
      parent: 'lane-plan',
    },
    // Build lane children
    {
      id: 'impl-01',
      type: 'process-box',
      props: { label: 'Implement', theme_category: 'application' },
      parent: 'lane-build',
    },
    {
      id: 'test-01',
      type: 'process-box',
      props: { label: 'Write Tests', theme_category: 'application' },
      parent: 'lane-build',
    },
    // Ship lane children
    {
      id: 'review-01',
      type: 'process-box',
      props: { label: 'Code Review', theme_category: 'infrastructure' },
      parent: 'lane-ship',
    },
    {
      id: 'deploy-01',
      type: 'process-box',
      props: { label: 'Deploy', theme_category: 'infrastructure' },
      parent: 'lane-ship',
    },
    // Cross-lane arrows
    {
      id: 'arrow-01',
      type: 'arrow',
      props: { from: 'spec-01', to: 'design-01', semantic: 'leads to', style: { line: 'solid', direction: 'forward', weight: 'normal' } },
      parent: null,
    },
    {
      id: 'arrow-02',
      type: 'arrow',
      props: { from: 'design-01', to: 'impl-01', semantic: 'drives', style: { line: 'solid', direction: 'forward', weight: 'normal' } },
      parent: null,
    },
    {
      id: 'arrow-03',
      type: 'arrow',
      props: { from: 'impl-01', to: 'test-01', semantic: 'verified by', style: { line: 'solid', direction: 'forward', weight: 'normal' } },
      parent: null,
    },
    {
      id: 'arrow-04',
      type: 'arrow',
      props: { from: 'test-01', to: 'review-01', semantic: 'submitted for', style: { line: 'solid', direction: 'forward', weight: 'normal' } },
      parent: null,
    },
    {
      id: 'arrow-05',
      type: 'arrow',
      props: { from: 'review-01', to: 'deploy-01', semantic: 'approved for', style: { line: 'solid', direction: 'forward', weight: 'normal' } },
      parent: null,
    },
  ],
}

export default swimLane
