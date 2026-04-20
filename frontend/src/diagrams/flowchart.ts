import type { DiagramJSON } from '../types'

// Simple flowchart on 1200px canvas — single column, branches symmetric around x=600
const flowchart: DiagramJSON = {
  diagramai_version: '0.1',
  diagram_style: 'clean',
  components: [
    { id: 'start-01',    type: 'start-end',    x: 540, y: 40,  width: 120, height: 40,  props: { label: 'Start',        theme_category: 'neutral'     }, parent: null },
    { id: 'process-01',  type: 'process-box',  x: 520, y: 160, width: 160, height: 52,  props: { label: 'Collect Data',  theme_category: 'application' }, parent: null },
    { id: 'decision-01', type: 'decision-box', x: 535, y: 280, width: 130, height: 52,  props: { label: 'Data Valid?',   theme_category: 'neutral'     }, parent: null },
    { id: 'process-02',  type: 'process-box',  x: 220, y: 400, width: 160, height: 52,  props: { label: 'Process Data',  theme_category: 'application' }, parent: null },
    { id: 'process-03',  type: 'process-box',  x: 820, y: 400, width: 160, height: 52,  props: { label: 'Log Error',     theme_category: 'security'    }, parent: null },
    { id: 'end-01',      type: 'start-end',    x: 540, y: 520, width: 120, height: 40,  props: { label: 'End',           theme_category: 'neutral'     }, parent: null },

    { id: 'arrow-01', type: 'arrow', props: { from: 'start-01',    to: 'process-01'                                           }, parent: null },
    { id: 'arrow-02', type: 'arrow', props: { from: 'process-01',  to: 'decision-01'                                          }, parent: null },
    { id: 'arrow-03', type: 'arrow', props: { from: 'decision-01', to: 'process-02', label: 'yes'                             }, parent: null },
    { id: 'arrow-04', type: 'arrow', props: { from: 'decision-01', to: 'process-03', label: 'no',  style: { line: 'dashed' }  }, parent: null },
    { id: 'arrow-05', type: 'arrow', props: { from: 'process-02',  to: 'end-01'                                               }, parent: null },
    { id: 'arrow-06', type: 'arrow', props: { from: 'process-03',  to: 'end-01'                                               }, parent: null },
  ],
}

export default flowchart
