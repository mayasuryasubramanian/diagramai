import type { DiagramJSON } from '../types'

// Single column, centered on 1200px canvas at x=600
const architecture: DiagramJSON = {
  diagramai_version: '0.1',
  diagram_style: 'clean',
  components: [
    { id: 'browser-01',  type: 'process-box', x: 520, y: 40,  width: 160, height: 52, props: { label: 'Browser',         theme_category: 'actor'          }, parent: null },
    { id: 'gateway-01',  type: 'process-box', x: 520, y: 180, width: 160, height: 52, props: { label: 'API Gateway',      theme_category: 'infrastructure' }, parent: null },
    { id: 'backend-01',  type: 'process-box', x: 520, y: 320, width: 160, height: 52, props: { label: 'Backend Service',  theme_category: 'application'    }, parent: null },
    { id: 'db-01',       type: 'process-box', x: 520, y: 460, width: 160, height: 52, props: { label: 'Database',         theme_category: 'infrastructure' }, parent: null },

    { id: 'arrow-01', type: 'arrow', props: { from: 'browser-01', to: 'gateway-01', label: 'HTTPS'     }, parent: null },
    { id: 'arrow-02', type: 'arrow', props: { from: 'gateway-01', to: 'backend-01', label: 'routes to' }, parent: null },
    { id: 'arrow-03', type: 'arrow', props: { from: 'backend-01', to: 'db-01',      label: 'SQL', style: { direction: 'bidirectional' } }, parent: null },
  ],
}

export default architecture
