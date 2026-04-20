import type { DiagramJSON } from '../types'

// Order fulfillment on 1200px canvas — two decision branches, 7 layers
// Layer y values: 40, 180, 320, 460, 600, 740, 880
// Node sizes: process-box 160×52, decision-box 130×52, start-end 120×40
const flowchartComplex: DiagramJSON = {
  diagramai_version: '0.1',
  diagram_style: 'clean',
  components: [
    // Layer 0 — single node centred at x=600
    { id: 'start-01',        type: 'start-end',    x: 540, y: 40,  width: 120, height: 40, props: { label: 'Start',                theme_category: 'neutral'     }, parent: null },
    // Layer 1
    { id: 'receive-01',      type: 'process-box',  x: 520, y: 180, width: 160, height: 52, props: { label: 'Receive Order',         theme_category: 'application' }, parent: null },
    // Layer 2
    { id: 'stock-01',        type: 'decision-box', x: 535, y: 320, width: 130, height: 52, props: { label: 'In Stock?',             theme_category: 'neutral'     }, parent: null },
    // Layer 3 — two branches (centres at x=280 and x=920)
    { id: 'payment-01',      type: 'process-box',  x: 200, y: 460, width: 160, height: 52, props: { label: 'Process Payment',       theme_category: 'application' }, parent: null },
    { id: 'backorder-01',    type: 'decision-box', x: 855, y: 460, width: 130, height: 52, props: { label: 'Backorder?',            theme_category: 'neutral'     }, parent: null },
    // Layer 4
    { id: 'pay-ok-01',       type: 'decision-box', x: 75,  y: 600, width: 130, height: 52, props: { label: 'Payment OK?',           theme_category: 'neutral'     }, parent: null },
    { id: 'place-backorder', type: 'process-box',  x: 760, y: 600, width: 160, height: 52, props: { label: 'Place Backorder',       theme_category: 'neutral'     }, parent: null },
    { id: 'reject-01',       type: 'process-box',  x: 1000,y: 600, width: 160, height: 52, props: { label: 'Reject Order',          theme_category: 'security'    }, parent: null },
    // Layer 5
    { id: 'ship-01',         type: 'process-box',  x: 40,  y: 740, width: 160, height: 52, props: { label: 'Ship Order',            theme_category: 'application' }, parent: null },
    { id: 'cancel-01',       type: 'process-box',  x: 240, y: 740, width: 160, height: 52, props: { label: 'Cancel Order',          theme_category: 'security'    }, parent: null },
    // Layer 6 — converge
    { id: 'notify-01',       type: 'process-box',  x: 520, y: 880, width: 160, height: 52, props: { label: 'Notify Customer',       theme_category: 'neutral'     }, parent: null },
    // Layer 7
    { id: 'end-01',          type: 'start-end',    x: 540, y: 1020,width: 120, height: 40, props: { label: 'End',                   theme_category: 'neutral'     }, parent: null },

    { id: 'a-01', type: 'arrow', props: { from: 'start-01',        to: 'receive-01'                                             }, parent: null },
    { id: 'a-02', type: 'arrow', props: { from: 'receive-01',      to: 'stock-01'                                               }, parent: null },
    { id: 'a-03', type: 'arrow', props: { from: 'stock-01',        to: 'payment-01',      label: 'yes'                          }, parent: null },
    { id: 'a-04', type: 'arrow', props: { from: 'stock-01',        to: 'backorder-01',    label: 'no',  style: { line: 'dashed' } }, parent: null },
    { id: 'a-05', type: 'arrow', props: { from: 'payment-01',      to: 'pay-ok-01'                                              }, parent: null },
    { id: 'a-06', type: 'arrow', props: { from: 'backorder-01',    to: 'place-backorder', label: 'yes'                          }, parent: null },
    { id: 'a-07', type: 'arrow', props: { from: 'backorder-01',    to: 'reject-01',       label: 'no',  style: { line: 'dashed' } }, parent: null },
    { id: 'a-08', type: 'arrow', props: { from: 'pay-ok-01',       to: 'ship-01',         label: 'yes'                          }, parent: null },
    { id: 'a-09', type: 'arrow', props: { from: 'pay-ok-01',       to: 'cancel-01',       label: 'no',  style: { line: 'dashed' } }, parent: null },
    { id: 'a-10', type: 'arrow', props: { from: 'ship-01',         to: 'notify-01'                                              }, parent: null },
    { id: 'a-11', type: 'arrow', props: { from: 'cancel-01',       to: 'notify-01'                                              }, parent: null },
    { id: 'a-12', type: 'arrow', props: { from: 'place-backorder', to: 'notify-01'                                              }, parent: null },
    { id: 'a-13', type: 'arrow', props: { from: 'reject-01',       to: 'notify-01'                                              }, parent: null },
    { id: 'a-14', type: 'arrow', props: { from: 'notify-01',       to: 'end-01'                                                 }, parent: null },
  ],
}

export default flowchartComplex
