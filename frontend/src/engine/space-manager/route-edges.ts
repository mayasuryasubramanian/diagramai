/**
 * Edge routing — runs after all node positions are finalised.
 *
 * Each arrow exits from the edge of the source node at an x (or y) that
 * tracks the target's centre, clamped within the source's width.  This fans
 * out multiple arrows leaving the same node so they never share a bundled exit
 * point.  The same clamping is applied at the entry point.
 */

import type { DiagramJSON } from '../../types'
import type { CoordinateMap } from '../../types/space-manager'
import type { ComponentCoordinates, ConnectionCoordinates } from '../../types/plugin'
import { isConnector } from './utils'

const EDGE_MARGIN = 12   // min distance from node corner for exit/entry point

export function routeConnectors(diagram: DiagramJSON, coordinates: CoordinateMap): void {
  for (const c of diagram.components) {
    if (!isConnector(c)) continue

    const from = c.props['from'] as string | undefined
    const to   = c.props['to']   as string | undefined
    if (!from || !to) continue

    const src = coordinates[from]
    const tgt = coordinates[to]
    if (!src || !('width' in src) || !tgt || !('width' in tgt)) continue

    coordinates[c.id] = {
      waypoints: routeEdge(src as ComponentCoordinates, tgt as ComponentCoordinates),
    } satisfies ConnectionCoordinates
  }
}

// ─── Point helpers ────────────────────────────────────────────────────────────

type Pt = { x: number; y: number }

function clampX(coord: ComponentCoordinates, cx: number): number {
  return Math.max(coord.x + EDGE_MARGIN, Math.min(coord.x + coord.width - EDGE_MARGIN, cx))
}

function clampY(coord: ComponentCoordinates, cy: number): number {
  return Math.max(coord.y + EDGE_MARGIN, Math.min(coord.y + coord.height - EDGE_MARGIN, cy))
}

// ─── Core routing logic ───────────────────────────────────────────────────────

function routeEdge(
  src: ComponentCoordinates,
  tgt: ComponentCoordinates,
): Pt[] {
  const srcCx = src.x + src.width  / 2
  const srcCy = src.y + src.height / 2
  const tgtCx = tgt.x + tgt.width  / 2
  const tgtCy = tgt.y + tgt.height / 2

  // Distributed exit/entry: track where the OTHER node's centre is, clamped.
  const exitX  = clampX(src, tgtCx)   // exit point on source's h-edge
  const entryX = clampX(tgt, srcCx)   // entry point on target's h-edge
  const exitY  = clampY(src, tgtCy)   // exit point on source's v-edge
  const entryY = clampY(tgt, srcCy)   // entry point on target's v-edge

  // ── Target is in a lower layer: exit bottom, enter top ───────────────────
  if (tgt.y >= src.y + src.height - 4) {
    const p1: Pt = { x: exitX,  y: src.y + src.height }
    const p4: Pt = { x: entryX, y: tgt.y }
    if (Math.abs(p4.x - p1.x) < 2) return [p1, p4]
    const midY = (p1.y + p4.y) / 2
    return [p1, { x: p1.x, y: midY }, { x: p4.x, y: midY }, p4]
  }

  // ── Target is in a higher layer: exit top, enter bottom ──────────────────
  if (tgt.y + tgt.height <= src.y + 4) {
    const p1: Pt = { x: exitX,  y: src.y }
    const p4: Pt = { x: entryX, y: tgt.y + tgt.height }
    if (Math.abs(p4.x - p1.x) < 2) return [p1, p4]
    const midY = (p1.y + p4.y) / 2
    return [p1, { x: p1.x, y: midY }, { x: p4.x, y: midY }, p4]
  }

  // ── Same layer: exit/enter via side edges ────────────────────────────────
  if (tgtCx >= srcCx) {
    const p1: Pt = { x: src.x + src.width, y: exitY }
    const p4: Pt = { x: tgt.x,             y: entryY }
    if (Math.abs(p1.x - p4.x) < 2) return [p1, p4]
    const midX = (p1.x + p4.x) / 2
    return [p1, { x: midX, y: p1.y }, { x: midX, y: p4.y }, p4]
  } else {
    const p1: Pt = { x: src.x,             y: exitY }
    const p4: Pt = { x: tgt.x + tgt.width, y: entryY }
    if (Math.abs(p1.x - p4.x) < 2) return [p1, p4]
    const midX = (p1.x + p4.x) / 2
    return [p1, { x: midX, y: p1.y }, { x: midX, y: p4.y }, p4]
  }
}
