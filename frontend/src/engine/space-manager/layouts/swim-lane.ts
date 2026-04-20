/**
 * Swim-lane layout.
 *
 * Lanes (visual_form: 'band') stack top-to-bottom.
 * Children within each lane flow left-to-right.
 * Same-lane connectors route left-to-right; cross-lane connectors route top-to-bottom.
 *
 * All gaps are computed from actual content (child sizes, connector labels) — no fixed gaps.
 */
import type { DiagramJSON } from '../../../types'
import type { CoordinateMap } from '../../../types/space-manager'
import type { ComponentCoordinates } from '../../../types/plugin'
import { CANVAS_INITIAL_WIDTH, MIN_PADDING, MIN_GAP, LANE_HEADER, LANE_PADDING } from '../constants'
import { getSize, isConnector, isContainer, isOverlay } from '../utils'
import { requiredHorizontalGap } from '../sizing'
import { routeOrthogonal } from '../routing/orthogonal'

export function layoutSwimLane(diagram: DiagramJSON): CoordinateMap {
  const coords: CoordinateMap = {}

  const lanes = diagram.components.filter(c => isContainer(c) && c.parent === null)
  const connectors = diagram.components.filter(isConnector)
  const laneWidth = CANVAS_INITIAL_WIDTH - MIN_PADDING * 2

  let y = MIN_PADDING

  for (const lane of lanes) {
    const children = diagram.components.filter(
      c => c.parent === lane.id && !isConnector(c) && !isOverlay(c)
    )

    // Lane height is driven by its tallest child + padding — never a fixed constant
    const maxChildH = children.reduce((m, c) => Math.max(m, getSize(c).h), 0)
    const laneH = Math.max(maxChildH + LANE_PADDING * 2, LANE_HEADER + MIN_GAP)

    coords[lane.id] = { x: MIN_PADDING, y, width: laneWidth, height: laneH }

    // Place children left-to-right with content-driven gaps
    let cx = MIN_PADDING + LANE_HEADER + LANE_PADDING
    for (let i = 0; i < children.length; i++) {
      const { w, h } = getSize(children[i])
      const childY = y + (laneH - h) / 2
      coords[children[i].id] = { x: cx, y: childY, width: w, height: h }

      if (i < children.length - 1) {
        const required = requiredHorizontalGap(children[i].id, children[i + 1].id, connectors)
        cx += w + Math.max(MIN_GAP, required)
      }
    }

    y += laneH + MIN_GAP
  }

  // Build parent-lane lookup so we can detect cross-lane connectors
  const parentLane: Record<string, string | null> = {}
  for (const c of diagram.components) {
    if (!isConnector(c) && !isOverlay(c)) parentLane[c.id] = c.parent
  }

  // Route connectors: same-lane → left-to-right; cross-lane → top-to-bottom
  for (const conn of connectors) {
    const props = conn.props as { from?: string; to?: string }
    if (!props.from || !props.to) continue
    const src = coords[props.from] as ComponentCoordinates | undefined
    const tgt = coords[props.to] as ComponentCoordinates | undefined
    if (!src || !tgt) continue

    const crossLane = parentLane[props.from] !== parentLane[props.to]
    coords[conn.id] = routeOrthogonal(src, tgt, crossLane ? 'top-to-bottom' : 'left-to-right')
  }

  return coords
}
