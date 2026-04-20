import type { ComponentCoordinates, ConnectionCoordinates } from '../../../types/plugin'

type Direction = 'top-to-bottom' | 'left-to-right'
export type { Direction }

/**
 * Compute orthogonal waypoints between two component bounding boxes.
 * For top-to-bottom: exits source bottom-center, enters target top-center.
 * For left-to-right: exits source right-center, enters target left-center.
 * Routes via a midpoint to form a clean right-angle path.
 */
export function routeOrthogonal(
  src: ComponentCoordinates,
  tgt: ComponentCoordinates,
  direction: Direction
): ConnectionCoordinates {
  if (direction === 'top-to-bottom') {
    const sx = src.x + src.width / 2
    const sy = src.y + src.height
    const tx = tgt.x + tgt.width / 2
    const ty = tgt.y
    const midY = (sy + ty) / 2

    if (Math.abs(sx - tx) < 2) {
      // Same column — straight vertical line
      return { waypoints: [{ x: sx, y: sy }, { x: tx, y: ty }] }
    }

    return {
      waypoints: [
        { x: sx, y: sy },
        { x: sx, y: midY },
        { x: tx, y: midY },
        { x: tx, y: ty },
      ],
    }
  } else {
    // left-to-right
    const sx = src.x + src.width
    const sy = src.y + src.height / 2
    const tx = tgt.x
    const ty = tgt.y + tgt.height / 2
    const midX = (sx + tx) / 2

    if (Math.abs(sy - ty) < 2) {
      // Same row — straight horizontal line
      return { waypoints: [{ x: sx, y: sy }, { x: tx, y: ty }] }
    }

    return {
      waypoints: [
        { x: sx, y: sy },
        { x: midX, y: sy },
        { x: midX, y: ty },
        { x: tx, y: ty },
      ],
    }
  }
}

/**
 * Route a cross-lane connector through the inter-lane gap.
 *
 * Determines whether the target lane is above or below the source lane,
 * then exits the source node from the correct face (bottom for downward,
 * top for upward) and routes through the midpoint of the gap between the
 * two lane bounding boxes. This prevents the path from passing through
 * nodes in intermediate lanes.
 */
export function routeCrossLane(
  src: ComponentCoordinates,
  tgt: ComponentCoordinates,
  srcLane: ComponentCoordinates,
  tgtLane: ComponentCoordinates
): ConnectionCoordinates {
  const goingDown = tgtLane.y > srcLane.y

  if (goingDown) {
    const sx   = src.x + src.width / 2
    const sy   = src.y + src.height
    const tx   = tgt.x + tgt.width / 2
    const ty   = tgt.y
    const gapY = (srcLane.y + srcLane.height + tgtLane.y) / 2

    if (Math.abs(sx - tx) < 2) {
      return { waypoints: [{ x: sx, y: sy }, { x: tx, y: ty }] }
    }
    return { waypoints: [{ x: sx, y: sy }, { x: sx, y: gapY }, { x: tx, y: gapY }, { x: tx, y: ty }] }
  } else {
    // Going up — exit source top, enter target bottom
    const sx   = src.x + src.width / 2
    const sy   = src.y
    const tx   = tgt.x + tgt.width / 2
    const ty   = tgt.y + tgt.height
    const gapY = (tgtLane.y + tgtLane.height + srcLane.y) / 2

    if (Math.abs(sx - tx) < 2) {
      return { waypoints: [{ x: sx, y: sy }, { x: tx, y: ty }] }
    }
    return { waypoints: [{ x: sx, y: sy }, { x: sx, y: gapY }, { x: tx, y: gapY }, { x: tx, y: ty }] }
  }
}

/**
 * Route an arrow that must bypass intermediate nodes by exiting from the side.
 * side='right': exits source right-center, swings right by margin, descends, enters target right-center.
 * side='left': exits source left-center, swings left by margin, descends, enters target left-center.
 */
export function routeSideExit(
  src: ComponentCoordinates,
  tgt: ComponentCoordinates,
  side: 'right' | 'left',
  margin = 80
): ConnectionCoordinates {
  if (side === 'right') {
    const sx = src.x + src.width
    const sy = src.y + src.height / 2
    const tx = tgt.x + tgt.width
    const ty = tgt.y + tgt.height / 2
    const bypassX = Math.max(sx, tx) + margin
    return {
      waypoints: [
        { x: sx, y: sy },
        { x: bypassX, y: sy },
        { x: bypassX, y: ty },
        { x: tx, y: ty },
      ],
    }
  } else {
    const sx = src.x
    const sy = src.y + src.height / 2
    const tx = tgt.x
    const ty = tgt.y + tgt.height / 2
    const bypassX = Math.min(sx, tx) - margin
    return {
      waypoints: [
        { x: sx, y: sy },
        { x: bypassX, y: sy },
        { x: bypassX, y: ty },
        { x: tx, y: ty },
      ],
    }
  }
}
