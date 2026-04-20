/**
 * Sequential layout — used for flowchart, architecture, sequence, network.
 *
 * top-to-bottom  → flowchart
 * left-to-right  → architecture, sequence, network
 *
 * Gaps between nodes are computed dynamically from the labels of any connectors
 * running between them, so the layout always reflects actual content rather than
 * fixed constants.
 */
import type { DiagramJSON, Component } from '../../../types'
import type { CoordinateMap } from '../../../types/space-manager'
import type { ComponentCoordinates } from '../../../types/plugin'
import { CANVAS_INITIAL_WIDTH, MIN_PADDING, MIN_GAP } from '../constants'
import { getSize, isConnector, isOverlay } from '../utils'
import { requiredHorizontalGap, requiredVerticalGap } from '../sizing'
import { routeOrthogonal, routeSideExit } from '../routing/orthogonal'

type Direction = 'top-to-bottom' | 'left-to-right'

export function layoutSequential(diagram: DiagramJSON, direction: Direction): CoordinateMap {
  const coords: CoordinateMap = {}

  const nodes = diagram.components.filter(
    c => !isConnector(c) && !isOverlay(c) && c.parent === null
  )
  const connectors = diagram.components.filter(isConnector)

  if (direction === 'top-to-bottom') {
    placeTopToBottom(nodes, connectors, coords)
  } else {
    placeLeftToRight(nodes, connectors, coords)
  }

  // Build node order map for skip-arrow detection (top-to-bottom only)
  const nodeOrderMap: Record<string, number> = {}
  if (direction === 'top-to-bottom') {
    nodes.forEach((n, i) => { nodeOrderMap[n.id] = i })
  }

  // Route connectors.
  // In top-to-bottom layouts, arrows that skip one or more nodes are sent via a
  // side channel to avoid cutting through intermediate boxes.
  // Alternate sides (right/left) across skip-arrows so they don't overlap each other.
  let skipCounter = 0
  const sides: ('right' | 'left')[] = ['right', 'left']

  for (const conn of connectors) {
    const props = conn.props as { from?: string; to?: string }
    if (!props.from || !props.to) continue
    const src = coords[props.from] as ComponentCoordinates | undefined
    const tgt = coords[props.to] as ComponentCoordinates | undefined
    if (!src || !tgt) continue

    const fromIdx = nodeOrderMap[props.from] ?? -1
    const toIdx   = nodeOrderMap[props.to]   ?? -1
    const skipsNodes = fromIdx >= 0 && toIdx >= 0 && toIdx > fromIdx + 1

    if (skipsNodes) {
      coords[conn.id] = routeSideExit(src, tgt, sides[skipCounter % 2])
      skipCounter++
    } else {
      coords[conn.id] = routeOrthogonal(src, tgt, direction)
    }
  }

  return coords
}

function placeTopToBottom(
  nodes: Component[],
  connectors: Component[],
  coords: CoordinateMap
): void {
  let y = MIN_PADDING
  for (let i = 0; i < nodes.length; i++) {
    const { w, h } = getSize(nodes[i])
    const x = (CANVAS_INITIAL_WIDTH - w) / 2
    coords[nodes[i].id] = { x, y, width: w, height: h }

    if (i < nodes.length - 1) {
      const required = requiredVerticalGap(nodes[i].id, nodes[i + 1].id, connectors)
      y += h + Math.max(MIN_GAP, required)
    }
  }
}

function placeLeftToRight(
  nodes: Component[],
  connectors: Component[],
  coords: CoordinateMap
): void {
  const maxH = nodes.reduce((m, n) => Math.max(m, getSize(n).h), 0)
  const centerY = MIN_PADDING + maxH / 2

  let x = MIN_PADDING
  for (let i = 0; i < nodes.length; i++) {
    const { w, h } = getSize(nodes[i])
    coords[nodes[i].id] = { x, y: centerY - h / 2, width: w, height: h }

    if (i < nodes.length - 1) {
      const required = requiredHorizontalGap(nodes[i].id, nodes[i + 1].id, connectors)
      x += w + Math.max(MIN_GAP, required)
    }
  }
}
