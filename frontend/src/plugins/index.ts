import { registerPlugin } from './registry'
import processBox from './process-box'
import decisionBox from './decision-box'
import startEnd from './start-end'
import swimLane from './swim-lane'
import arrow from './arrow'

export function loadCorePlugins() {
  registerPlugin(processBox)
  registerPlugin(decisionBox)
  registerPlugin(startEnd)
  registerPlugin(swimLane)
  registerPlugin(arrow)
}

export { getPlugin, getAllPlugins, getRegistrySchema } from './registry'
