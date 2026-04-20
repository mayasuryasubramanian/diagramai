/**
 * Local Repair — fixes geometric problems in-place after layout.
 *
 * Philosophy: layout is expensive to re-run. Most post-layout problems are
 * small (two nodes that barely touch, a node slightly off-canvas).  These can
 * be resolved by nudging individual coordinates rather than re-running ELK.
 *
 * Rules:
 *   - Only move the LATER node in document order (avoids cascading shifts).
 *   - Only nudge by the minimum amount to clear the problem.
 *   - Never move a container (swim-lane) — move its children instead.
 *   - Never change edge waypoints — ELK-routed paths are accepted as-is.
 *     Edge quality warnings are surfaced to the user via the geometric
 *     validator; the user can correct them with natural language.
 */

import type { DiagramJSON } from '../../types'
import type { CoordinateMap } from '../../types/space-manager'
import type { ComponentCoordinates } from '../../types/plugin'
import { getPlugin } from '../../plugins/registry'

const MIN_GAP = 8  // minimum clearance to maintain between nodes after repair

export function repairLayout(
  diagram: DiagramJSON,
  coordinates: CoordinateMap
): void {
  const nodes = diagram.components.filter(c => {
    const p = getPlugin(c.type)
    return p && p.visual_form !== 'line' && p.visual_form !== 'overlay'
  })

  // Repair 1: negative coordinates (canvas-bounds violation)
  repairNegativeCoords(nodes, coordinates)

  // Repair 2: overlapping sibling nodes
  repairOverlaps(nodes, coordinates)
}

// ─── Repair 1: push nodes with negative coords to (0,0) + margin ─────────────

function repairNegativeCoords(
  nodes: DiagramJSON['components'],
  coordinates: CoordinateMap
): void {
  for (const c of nodes) {
    const coord = coordinates[c.id] as ComponentCoordinates | undefined
    if (!coord) continue
    let { x, y, width, height } = coord
    let changed = false
    if (x < MIN_GAP) { x = MIN_GAP; changed = true }
    if (y < MIN_GAP) { y = MIN_GAP; changed = true }
    if (changed) coordinates[c.id] = { x, y, width, height }
  }
}

// ─── Repair 2: push overlapping siblings apart ────────────────────────────────
// Only repairs pairs that share the same parent (siblings within a lane, or
// two top-level nodes).  Cross-container overlaps are structural problems
// better handled by a re-translation — surface them as warnings instead.

function repairOverlaps(
  nodes: DiagramJSON['components'],
  coordinates: CoordinateMap
): void {
  // Group nodes by parent
  const byParent = new Map<string | null, typeof nodes>()
  for (const c of nodes) {
    const key = c.parent ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(c)
  }

  for (const siblings of byParent.values()) {
    // Process siblings in document order; only move the LATER one
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        const a = coordinates[siblings[i].id] as ComponentCoordinates | undefined
        const b = coordinates[siblings[j].id] as ComponentCoordinates | undefined
        if (!a || !b) continue

        const overlapX = (a.x + a.width  + MIN_GAP) - b.x
        const overlapY = (a.y + a.height + MIN_GAP) - b.y

        if (overlapX <= 0 || overlapY <= 0) continue  // no overlap

        // Nudge b in the direction of minimum overlap
        if (overlapX < overlapY) {
          // Horizontal push — move b right
          coordinates[siblings[j].id] = { ...b, x: b.x + overlapX }
        } else {
          // Vertical push — move b down
          coordinates[siblings[j].id] = { ...b, y: b.y + overlapY }
        }
      }
    }
  }
}
