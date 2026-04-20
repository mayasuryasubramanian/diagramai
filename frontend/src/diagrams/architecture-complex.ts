import type { DiagramJSON } from '../types'

// Microservices on 1200px canvas — 3 services spread evenly at layer 3
// Layer centres: client/lb/gateway at x=600; services at x=120,600,1080; db at x=600
const architectureComplex: DiagramJSON = {
  diagramai_version: '0.1',
  diagram_style: 'clean',
  components: [
    // Layer 0 — client
    { id: 'client-01',  type: 'process-box', x: 520, y: 40,  width: 160, height: 52, props: { label: 'Client',        theme_category: 'actor'          }, parent: null },
    // Layer 1 — load balancer
    { id: 'lb-01',      type: 'process-box', x: 520, y: 180, width: 160, height: 52, props: { label: 'Load Balancer', theme_category: 'infrastructure' }, parent: null },
    // Layer 2 — gateway
    { id: 'gateway-01', type: 'process-box', x: 520, y: 320, width: 160, height: 52, props: { label: 'API Gateway',   theme_category: 'infrastructure' }, parent: null },
    // Layer 3 — services (N=3: centres at 120, 600, 1080 → x = 40, 520, 1000)
    { id: 'auth-01',    type: 'process-box', x: 40,  y: 460, width: 160, height: 52, props: { label: 'Auth Service',  theme_category: 'security'       }, parent: null },
    { id: 'user-01',    type: 'process-box', x: 520, y: 460, width: 160, height: 52, props: { label: 'User Service',  theme_category: 'application'    }, parent: null },
    { id: 'order-01',   type: 'process-box', x: 1000,y: 460, width: 160, height: 52, props: { label: 'Order Service', theme_category: 'application'    }, parent: null },
    // Layer 4 — database
    { id: 'db-01',      type: 'process-box', x: 520, y: 600, width: 160, height: 52, props: { label: 'PostgreSQL',    theme_category: 'infrastructure' }, parent: null },

    { id: 'arrow-01', type: 'arrow', props: { from: 'client-01',  to: 'lb-01',      label: 'HTTPS'  }, parent: null },
    { id: 'arrow-02', type: 'arrow', props: { from: 'lb-01',      to: 'gateway-01'                  }, parent: null },
    { id: 'arrow-03', type: 'arrow', props: { from: 'gateway-01', to: 'auth-01',    label: 'verify' }, parent: null },
    { id: 'arrow-04', type: 'arrow', props: { from: 'gateway-01', to: 'user-01'                     }, parent: null },
    { id: 'arrow-05', type: 'arrow', props: { from: 'gateway-01', to: 'order-01'                    }, parent: null },
    { id: 'arrow-06', type: 'arrow', props: { from: 'user-01',    to: 'db-01',      label: 'SQL', style: { direction: 'bidirectional' } }, parent: null },
    { id: 'arrow-07', type: 'arrow', props: { from: 'order-01',   to: 'db-01',      label: 'SQL', style: { direction: 'bidirectional' } }, parent: null },
  ],
}

export default architectureComplex
