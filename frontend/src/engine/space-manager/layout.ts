/**
 * Geometry-driven layout.
 *
 * Takes DiagramGeometry (from the Geometry Planner) and the sized DiagramJSON
 * and maps (rank, order, size) → pixel coordinates.
 *
 * Gap sizes between ranks are computed from the labels of connectors that
 * cross those ranks — never hardcoded.
 */

import type { DiagramJSON, Component } from '../../types/diagram'
import type { DiagramGeometry, GeometryNode } from '../../types/geometry'
import type { CoordinateMap } from '../../types/space-manager'
import type { ComponentCoordinates } from '../../types/plugin'
import {
  MIN_PADDING,
  LANE_HEADER, LANE_PADDING,
  CANVAS_INITIAL_WIDTH,
  LABEL_FONT_SIZE, LABEL_CLEARANCE,
} from './constants'
import { getSize, isConnector } from './utils'
import { estimateTextWidth } from './sizing'
import { routeOrthogonal, routeSideExit, routeCrossLane } from './routing/orthogonal'

export function layoutFromGeometry(
  geometry: DiagramGeometry,
  diagram: DiagramJSON
): CoordinateMap {
  const coords: CoordinateMap = {}

  // Index diagram components by ID for O(1) lookups
  const compById = new Map<string, Component>(diagram.components.map(c => [c.id, c]))

  // Index connectors for gap computation
  const connectorById = new Map<string, Component>(
    diagram.components.filter(c => isConnector(c)).map(c => [c.id, c])
  )

  // Phase A — place nodes according to mode
  switch (geometry.mode) {
    case 'dag-tb':
      placeDAG(geometry, compById, connectorById, coords)
      break
    case 'seq-lr':
      placeSequential(geometry, compById, connectorById, coords)
      break
    case 'swim-lane':
      placeSwimLane(geometry, compById, connectorById, coords)
      break
  }

  // Phase B — route all edges
  for (const edge of geometry.edges) {
    const src = coords[edge.from] as ComponentCoordinates | undefined
    const tgt = coords[edge.to]  as ComponentCoordinates | undefined
    if (!src || !tgt) continue

    if (edge.route !== 'direct') {
      coords[edge.id] = routeSideExit(src, tgt, edge.route === 'bypass-right' ? 'right' : 'left')
      continue
    }

    // Direct edges: direction depends on mode and lane membership
    if (geometry.mode === 'swim-lane') {
      const fromLane = geometry.nodes[edge.from]?.lane
      const toLane   = geometry.nodes[edge.to]?.lane
      const crossLane = fromLane !== toLane
      if (crossLane && fromLane && toLane) {
        const srcLane = coords[fromLane] as ComponentCoordinates | undefined
        const tgtLane = coords[toLane]   as ComponentCoordinates | undefined
        coords[edge.id] = srcLane && tgtLane
          ? routeCrossLane(src, tgt, srcLane, tgtLane)
          : routeOrthogonal(src, tgt, 'top-to-bottom')
      } else {
        coords[edge.id] = routeOrthogonal(src, tgt, 'left-to-right')
      }
    } else {
      const dir = geometry.mode === 'seq-lr' ? 'left-to-right' : 'top-to-bottom'
      coords[edge.id] = routeOrthogonal(src, tgt, dir)
    }
  }

  return coords
}

// ─── DAG top-to-bottom ────────────────────────────────────────────────────────
//
// Ranks stack vertically. Within each rank, nodes sit side-by-side centered
// on the canvas. Gap between ranks is driven by connector labels.

function placeDAG(
  geometry: DiagramGeometry,
  compById: Map<string, Component>,
  connectorById: Map<string, Component>,
  coords: CoordinateMap
): void {
  let y = MIN_PADDING

  for (let r = 0; r < geometry.ranks.length; r++) {
    const rank = geometry.ranks[r]

    // Sizes of all nodes at this rank
    const sizes = rank.map(id => {
      const c = compById.get(id)
      return c ? getSize(c) : { w: 0, h: 0 }
    })
    const maxH  = sizes.reduce((m, s) => Math.max(m, s.h), 0)
    const totalW = sizes.reduce((s, sz) => s + sz.w, 0) + Math.max(0, rank.length - 1) * MIN_PADDING

    // Center the group horizontally
    let x = Math.max(MIN_PADDING, (CANVAS_INITIAL_WIDTH - totalW) / 2)

    for (let o = 0; o < rank.length; o++) {
      const { w, h } = sizes[o]
      coords[rank[o]] = { x, y, width: w, height: h }
      x += w + MIN_PADDING
    }

    // Gap to the next rank from connector labels
    if (r < geometry.ranks.length - 1) {
      const gap = rankGap(rank, geometry.ranks[r + 1], geometry, connectorById, 'vertical')
      y += maxH + gap
    }
  }
}

// ─── Sequential left-to-right ─────────────────────────────────────────────────
//
// Ranks are columns. One node per rank typically. Gap between columns driven
// by connector label widths.

function placeSequential(
  geometry: DiagramGeometry,
  compById: Map<string, Component>,
  connectorById: Map<string, Component>,
  coords: CoordinateMap
): void {
  // Vertically center all nodes on a shared centerline
  const maxH = geometry.ranks.flat().reduce((m, id) => {
    const c = compById.get(id)
    return c ? Math.max(m, getSize(c).h) : m
  }, 0)
  const centerY = MIN_PADDING + maxH / 2

  let x = MIN_PADDING

  for (let r = 0; r < geometry.ranks.length; r++) {
    const rank = geometry.ranks[r]

    for (const id of rank) {
      const c = compById.get(id)
      if (!c) continue
      const { w, h } = getSize(c)
      coords[id] = { x, y: centerY - h / 2, width: w, height: h }
    }

    if (r < geometry.ranks.length - 1) {
      const rankW = rank.reduce((s, id) => {
        const c = compById.get(id)
        return c ? s + getSize(c).w : s
      }, 0)
      const gap = rankGap(rank, geometry.ranks[r + 1], geometry, connectorById, 'horizontal')
      x += rankW + gap
    }
  }
}

// ─── Swim-lane ─────────────────────────────────────────────────────────────────
//
// Lanes stack top-to-bottom. Within each lane children flow left-to-right.
// Lane height is determined by its tallest child.

function placeSwimLane(
  geometry: DiagramGeometry,
  compById: Map<string, Component>,
  connectorById: Map<string, Component>,
  coords: CoordinateMap
): void {
  const laneWidth = CANVAS_INITIAL_WIDTH - MIN_PADDING * 2
  let y = MIN_PADDING

  for (let r = 0; r < geometry.ranks.length; r++) {
    const laneId = geometry.ranks[r][0]
    const laneComp = compById.get(laneId)
    if (!laneComp) continue

    // Children of this lane, sorted by geometry order
    const children: GeometryNode[] = Object.values(geometry.nodes)
      .filter(n => n.lane === laneId)
      .sort((a, b) => a.order - b.order)

    const maxChildH = children.reduce((m, gn) => {
      const c = compById.get(gn.id)
      return c ? Math.max(m, getSize(c).h) : m
    }, 0)
    const laneH = Math.max(maxChildH + LANE_PADDING * 2, LANE_HEADER + MIN_PADDING)

    coords[laneId] = { x: MIN_PADDING, y, width: laneWidth, height: laneH }

    // Place children left-to-right with content-driven gaps
    let cx = MIN_PADDING + LANE_HEADER + LANE_PADDING
    for (let ci = 0; ci < children.length; ci++) {
      const c = compById.get(children[ci].id)
      if (!c) continue
      const { w, h } = getSize(c)
      coords[children[ci].id] = { x: cx, y: y + (laneH - h) / 2, width: w, height: h }

      if (ci < children.length - 1) {
        const gap = rankGap(
          [children[ci].id], [children[ci + 1].id],
          geometry, connectorById, 'horizontal'
        )
        cx += w + gap
      }
    }

    // Gap between this lane and the next
    if (r < geometry.ranks.length - 1) {
      const nextLaneId    = geometry.ranks[r + 1][0]
      const curChildIds   = children.map(n => n.id)
      const nextChildren  = Object.values(geometry.nodes)
        .filter(n => n.lane === nextLaneId)
        .map(n => n.id)
      const gap = rankGap(curChildIds, nextChildren, geometry, connectorById, 'vertical')
      y += laneH + gap
    }
  }
}

// ─── Gap helpers ──────────────────────────────────────────────────────────────

/**
 * Compute the gap between two sets of nodes (adjacent ranks) based on the
 * labels of edges that cross between them.
 *
 * horizontal: label must fit within the gap width
 * vertical:   label floats above the arrow midpoint, needs 2× label offset
 */
function rankGap(
  setA: string[],
  setB: string[],
  geometry: DiagramGeometry,
  connectorById: Map<string, Component>,
  direction: 'horizontal' | 'vertical'
): number {
  const a = new Set(setA)
  const b = new Set(setB)
  let maxRequired = 0

  for (const edge of geometry.edges) {
    if (!a.has(edge.from) || !b.has(edge.to)) continue
    const conn = connectorById.get(edge.id)
    if (!conn) continue
    const label = (conn.props as { label?: string }).label ?? ''
    if (!label) continue

    if (direction === 'horizontal') {
      const w = estimateTextWidth(label, LABEL_FONT_SIZE) + LABEL_CLEARANCE * 2
      maxRequired = Math.max(maxRequired, w)
    } else {
      // Label sits (LABEL_FONT_SIZE + 4) px above the midpoint of the gap.
      // For it to clear the source box: gap > 2 × offset.
      const offset = LABEL_FONT_SIZE + 4
      maxRequired = Math.max(maxRequired, offset * 2 + 8)
    }
  }

  return Math.max(MIN_PADDING, maxRequired)
}
