/**
 * libavoid-js routing — replaces hand-rolled orthogonal routing for seq-lr
 * and swim-lane diagrams.
 *
 * libavoid uses A* over a visibility graph. Guarantees:
 *   - No connector path passes through any node interior
 *   - Orthogonal segments only
 *   - Segments are nudged apart when they share the same grid line
 *
 * Node positions are taken as-is from the coordinate map (placement is already
 * done by the geometry planner + layout). Only ConnectionCoordinates entries
 * are replaced.
 */

import { AvoidLib } from 'libavoid-js'
import type { DiagramJSON } from '../../types'
import type { CoordinateMap } from '../../types/space-manager'
import type { ComponentCoordinates, ConnectionCoordinates } from '../../types/plugin'
import { isConnector, isOverlay } from './utils'

// WASM binary served from /public/ (copied from node_modules at install time)
const WASM_URL = '/libavoid.wasm'

// ─── WASM initialisation ──────────────────────────────────────────────────────

let loadPromise: Promise<void> | null = null

function ensureLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = AvoidLib.load(WASM_URL)
  }
  return loadPromise
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Re-route all connectors in `coords` using libavoid.
 * ComponentCoordinates entries are passed through unchanged.
 * Only ConnectionCoordinates entries are replaced with libavoid-computed routes.
 */
export async function routeWithLibavoid(
  diagram: DiagramJSON,
  coords: CoordinateMap
): Promise<CoordinateMap> {
  await ensureLoaded()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Avoid = AvoidLib.getInstance() as any

  // RouterFlag is an Emscripten enum class — values are objects { value: N }
  // Router constructor takes unsigned int, so we extract .value
  const orthogonalFlag: number = Avoid.RouterFlag.OrthogonalRouting.value
  const router = new Avoid.Router(orthogonalFlag)

  // ── Register node bounding boxes as obstacles ─────────────────────────────
  const shapeRefs = new Map<string, unknown>()

  for (const comp of diagram.components) {
    if (isConnector(comp) || isOverlay(comp)) continue
    const coord = coords[comp.id] as ComponentCoordinates | undefined
    if (!coord) continue

    // Use centre + width + height overload (avoids overload dispatch ambiguity)
    const cx   = coord.x + coord.width  / 2
    const cy   = coord.y + coord.height / 2
    const rect = new Avoid.Rectangle(new Avoid.Point(cx, cy), coord.width, coord.height)
    shapeRefs.set(comp.id, new Avoid.ShapeRef(router, rect))
  }

  // ── Register connection pins on each shape ───────────────────────────────
  // ConnEnd(ShapeRef, classId) requires ShapeConnectionPins registered with
  // that classId. Without them libavoid's pin-search loops indefinitely.
  // We place 4 pins (one per edge midpoint) with classId=1 and ConnDirAll=15.
  const connDirAll = 15   // Up=1 | Down=2 | Left=4 | Right=8
  const pinRefs: unknown[] = []

  for (const shapeRef of shapeRefs.values()) {
    const pins = [
      new Avoid.ShapeConnectionPin(shapeRef, 1, 0.5, 0.0, true, 0, connDirAll), // top
      new Avoid.ShapeConnectionPin(shapeRef, 1, 0.5, 1.0, true, 0, connDirAll), // bottom
      new Avoid.ShapeConnectionPin(shapeRef, 1, 0.0, 0.5, true, 0, connDirAll), // left
      new Avoid.ShapeConnectionPin(shapeRef, 1, 1.0, 0.5, true, 0, connDirAll), // right
    ]
    for (const pin of pins) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(pin as any).setExclusive(false)
      pinRefs.push(pin)
    }
  }

  // ── Register connectors ───────────────────────────────────────────────────
  // ConnEnd(ShapeRef, classId=1) connects to the nearest registered pin.
  const connRefs = new Map<string, unknown>()

  for (const comp of diagram.components) {
    if (!isConnector(comp)) continue
    const from = comp.props['from'] as string | undefined
    const to   = comp.props['to']   as string | undefined
    if (!from || !to) continue

    const fromShape = shapeRefs.get(from)
    const toShape   = shapeRefs.get(to)
    if (!fromShape || !toShape) continue

    const srcEnd = new Avoid.ConnEnd(fromShape, 1)
    const dstEnd = new Avoid.ConnEnd(toShape,   1)
    connRefs.set(comp.id, new Avoid.ConnRef(router, srcEnd, dstEnd))
  }

  // ── Compute all routes in one pass ────────────────────────────────────────
  router.processTransaction()

  // ── Extract waypoints ─────────────────────────────────────────────────────
  const result: CoordinateMap = { ...coords }

  for (const [id, connRef] of connRefs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const polyline = (connRef as any).displayRoute()
    const waypoints: { x: number; y: number }[] = []
    for (let i = 0; i < polyline.size(); i++) {
      const pt = polyline.at(i)
      waypoints.push({ x: pt.x, y: pt.y })
    }
    if (waypoints.length >= 2) {
      result[id] = { waypoints } satisfies ConnectionCoordinates
    }
  }

  // ── Clean up WASM objects (prevent memory leaks) ──────────────────────────
  // Order: connRefs → pins → shapeRefs → router
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const connRef of connRefs.values())  (connRef as any).delete()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const pin     of pinRefs)            (pin     as any).delete()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const shapeRef of shapeRefs.values()) (shapeRef as any).delete()
  router.delete()

  return result
}

