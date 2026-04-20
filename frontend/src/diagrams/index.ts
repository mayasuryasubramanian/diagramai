import flowchart from './flowchart'
import flowchartComplex from './flowchart-complex'
import architecture from './architecture'
import architectureComplex from './architecture-complex'
import swimLane from './swim-lane'
import swimLaneComplex from './swim-lane-complex'

export const PRESETS = [
  { id: 'flowchart',            label: 'Flowchart',             syntax: flowchart            },
  { id: 'flowchart-complex',    label: 'Flowchart (complex)',    syntax: flowchartComplex     },
  { id: 'architecture',         label: 'Architecture',          syntax: architecture         },
  { id: 'architecture-complex', label: 'Architecture (complex)', syntax: architectureComplex },
  { id: 'swim-lane',            label: 'Swim Lane',             syntax: swimLane             },
  { id: 'swim-lane-complex',    label: 'Swim Lane (complex)',   syntax: swimLaneComplex      },
] as const
