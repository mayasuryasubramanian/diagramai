import flowchart from './flowchart'
import flowchartComplex from './flowchart-complex'
import architecture from './architecture'
import architectureComplex from './architecture-complex'
import swimLane from './swim-lane'
import swimLaneComplex from './swim-lane-complex'

export const PRESETS = [
  { id: 'flowchart',             label: 'Flowchart',             diagram: flowchart             },
  { id: 'flowchart-complex',     label: 'Flowchart (complex)',    diagram: flowchartComplex      },
  { id: 'architecture',          label: 'Architecture',          diagram: architecture          },
  { id: 'architecture-complex',  label: 'Architecture (complex)', diagram: architectureComplex  },
  { id: 'swim-lane',             label: 'Swim Lane',             diagram: swimLane              },
  { id: 'swim-lane-complex',     label: 'Swim Lane (complex)',   diagram: swimLaneComplex       },
] as const
