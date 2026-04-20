/**
 * Geometric Validator — runs after Space Manager + Workflow Engine.
 *
 * Philosophy: NEVER block rendering. The validator collects warnings about
 * layout quality issues and returns them alongside the SVG. The user sees the
 * diagram and can correct it with natural language if needed.
 *
 * Removed checks:
 *   text-overflow — Space Manager already sizes every component to fit its
 *     label (computeComponentSize expands width to labelWidth + padding).
 *     Re-checking with a different formula produces false positives and is
 *     redundant. Removed entirely.
 *
 * Remaining checks produce warnings, not failures:
 *   component-overlap  — two bounding boxes intersect (layout quality issue)
 *   arrow-routing      — connector segment crosses a label (visual clutter)
 *   canvas-bounds      — component coordinate is negative (Space Manager bug)
 */

import type { DiagramJSON } from '../../types'
import type { CoordinateMap } from '../../types/space-manager'
import type { ComponentCoordinates, ConnectionCoordinates } from '../../types/plugin'
import { getPlugin } from '../../plugins/registry'

export interface GeometricWarning {
  check:               'component-overlap' | 'arrow-routing' | 'canvas-bounds'
  components_involved: string[]
  detail:              string
}

export interface GeometricValidationResult {
  result:   'pass'
  warnings: GeometricWarning[]   // empty = fully clean; non-empty = rendered with issues
}

export function runGeometricValidator(
  diagram: DiagramJSON,
  coordinates: CoordinateMap,
  canvas: { width: number; height: number }
): GeometricValidationResult {
  const warnings: GeometricWarning[] = [
    ...checkOverlap(diagram, coordinates),
    ...checkArrowRouting(diagram, coordinates),
    ...checkCanvasBounds(diagram, coordinates, canvas),
  ]

  if (warnings.length > 0) {
    console.warn('[geometric-validator] layout warnings:', warnings)
  }

  return { result: 'pass', warnings }
}

// ─── Check 1: Component overlap ──────────────────────────────────────────────

function checkOverlap(diagram: DiagramJSON, coordinates: CoordinateMap): GeometricWarning[] {
  const nodes = diagram.components.filter(
    c => !isConnector(c.type) && !isOverlay(c.type)
  )
  const warnings: GeometricWarning[] = []

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      if (a.parent === b.id || b.parent === a.id) continue  // child inside parent is fine

      const ca = coordinates[a.id]
      const cb = coordinates[b.id]
      if (!ca || !cb || !('width' in ca) || !('width' in cb)) continue

      if (boxesIntersect(ca as ComponentCoordinates, cb as ComponentCoordinates)) {
        warnings.push({
          check: 'component-overlap',
          components_involved: [a.id, b.id],
          detail: `"${a.id}" and "${b.id}" bounding boxes overlap`,
        })
      }
    }
  }
  return warnings
}

// ─── Check 2: Arrow routing ───────────────────────────────────────────────────

function checkArrowRouting(diagram: DiagramJSON, coordinates: CoordinateMap): GeometricWarning[] {
  const connectors = diagram.components.filter(c => isConnector(c.type))
  const labels     = diagram.components.filter(c => {
    const p = getPlugin(c.type)
    return p?.visual_form === 'overlay' && typeof c.props['label'] === 'string'
  })
  if (labels.length === 0) return []

  const warnings: GeometricWarning[] = []

  for (const conn of connectors) {
    const coord = coordinates[conn.id] as ConnectionCoordinates | undefined
    if (!coord?.waypoints || coord.waypoints.length < 2) continue

    for (let s = 0; s < coord.waypoints.length - 1; s++) {
      const p1 = coord.waypoints[s]
      const p2 = coord.waypoints[s + 1]

      for (const label of labels) {
        const lc = coordinates[label.id] as ComponentCoordinates | undefined
        if (!lc) continue
        if (segmentIntersectsRect(p1.x, p1.y, p2.x, p2.y, lc)) {
          warnings.push({
            check: 'arrow-routing',
            components_involved: [conn.id, label.id],
            detail: `Connector "${conn.id}" passes through label "${label.id}"`,
          })
        }
      }
    }
  }
  return warnings
}

// ─── Check 3: Canvas bounds ───────────────────────────────────────────────────
// Only warns on negative coordinates — those indicate a Space Manager bug.
// Components extending beyond canvas width/height are fine; the canvas
// is computed from content extents and always fits.

function checkCanvasBounds(
  diagram: DiagramJSON,
  coordinates: CoordinateMap,
  _canvas: { width: number; height: number }
): GeometricWarning[] {
  const warnings: GeometricWarning[] = []

  for (const c of diagram.components) {
    if (isConnector(c.type)) continue
    const coord = coordinates[c.id] as ComponentCoordinates | undefined
    if (!coord) continue

    if (coord.x < 0 || coord.y < 0) {
      warnings.push({
        check: 'canvas-bounds',
        components_involved: [c.id],
        detail: `"${c.id}" has negative coordinates (${coord.x.toFixed(0)}, ${coord.y.toFixed(0)})`,
      })
    }
  }
  return warnings
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function boxesIntersect(a: ComponentCoordinates, b: ComponentCoordinates): boolean {
  return !(
    a.x + a.width  <= b.x ||
    b.x + b.width  <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )
}

function segmentIntersectsRect(
  x1: number, y1: number,
  x2: number, y2: number,
  r: ComponentCoordinates
): boolean {
  const dx = x2 - x1
  const dy = y2 - y1
  const ps = [-dx, dx, -dy, dy]
  const qs = [x1 - r.x, r.x + r.width - x1, y1 - r.y, r.y + r.height - y1]

  let t0 = 0, t1 = 1
  for (let i = 0; i < 4; i++) {
    if (ps[i] === 0) {
      if (qs[i] < 0) return false
    } else {
      const t = qs[i] / ps[i]
      if (ps[i] < 0) t0 = Math.max(t0, t)
      else           t1 = Math.min(t1, t)
    }
  }
  return t0 <= t1
}

function isConnector(type: string): boolean {
  return getPlugin(type)?.visual_form === 'line'
}

function isOverlay(type: string): boolean {
  return getPlugin(type)?.visual_form === 'overlay'
}
