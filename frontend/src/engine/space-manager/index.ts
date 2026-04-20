/**
 * Space Manager — entry point.
 *
 * Two modes:
 *
 *   Mode A — AI-provided coordinates (Option C)
 *     When every non-connector component has x, y, width, height in the
 *     DiagramJSON (output by the AI), we use those directly and skip ELK.
 *
 *   Mode B — ELK fallback
 *     When coordinates are absent (old diagrams, sample data), ELK computes
 *     node positions via the Sugiyama layered algorithm.
 *
 * Edge routing is always done by routeConnectors() in pipeline.ts — never ELK.
 */

import type { DiagramJSON, Component } from '../../types'
import type { SpaceManagerOutput, SpaceManagerError, CoordinateMap } from '../../types/space-manager'
import type { ComponentCoordinates } from '../../types/plugin'
import { getPlugin } from '../../plugins/registry'
import { layoutWithElk } from './elk-layout'
import { computeComponentSize } from './sizing'
import type { SizeMode } from './sizing'
import { CANVAS_INITIAL_WIDTH, MIN_PADDING } from './constants'
import { isConnector, isOverlay } from './utils'

export async function runSpaceManager(diagram: DiagramJSON): Promise<SpaceManagerOutput | SpaceManagerError> {
  try {
    const sized = assignSizes(diagram, 'normal')

    const raw = hasProvidedCoordinates(sized)
      ? extractProvidedCoordinates(sized)
      : await layoutWithElk(sized)

    const coordinates = normalizeCoordinates(raw)
    const canvas      = computeCanvas(coordinates)

    return { diagram: sized, coordinates, canvas, fit_status: { ok: true } }
  } catch (err) {
    return {
      stage: 'space-manager',
      constraint_violated: 'layout-error',
      components_involved: [],
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

export function isSpaceManagerError(
  result: SpaceManagerOutput | SpaceManagerError
): result is SpaceManagerError {
  return 'stage' in result && result.stage === 'space-manager'
}

// ─── Mode detection ───────────────────────────────────────────────────────────

function hasProvidedCoordinates(diagram: DiagramJSON): boolean {
  const nodes = diagram.components.filter(c => !isConnector(c) && !isOverlay(c))
  if (nodes.length === 0) return false
  return nodes.every(c => c.x !== undefined && c.y !== undefined)
}

function extractProvidedCoordinates(diagram: DiagramJSON): CoordinateMap {
  const coords: CoordinateMap = {}
  for (const c of diagram.components) {
    if (isConnector(c) || isOverlay(c)) continue
    if (c.x === undefined || c.y === undefined) continue
    const w = c.width  ?? c.size?.w ?? 160
    const h = c.height ?? c.size?.h ?? 52
    coords[c.id] = { x: c.x, y: c.y, width: w, height: h } satisfies ComponentCoordinates
  }
  return coords
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assignSizes(diagram: DiagramJSON, mode: SizeMode): DiagramJSON {
  const components = diagram.components.map(c => {
    if (c.size?.locked) return c
    const plugin = getPlugin(c.type)
    if (!plugin) return c
    return { ...c, size: computeComponentSize(c, plugin, mode) }
  })
  return { ...diagram, components }
}

function normalizeCoordinates(coordinates: CoordinateMap): CoordinateMap {
  let minX = Infinity
  let minY = Infinity

  for (const coord of Object.values(coordinates)) {
    if ('width' in coord) {
      const c = coord as ComponentCoordinates
      minX = Math.min(minX, c.x)
      minY = Math.min(minY, c.y)
    }
  }

  if (!isFinite(minX)) return coordinates

  const dx = MIN_PADDING - minX
  const dy = MIN_PADDING - minY
  if (dx === 0 && dy === 0) return coordinates

  const result: CoordinateMap = {}
  for (const [id, coord] of Object.entries(coordinates)) {
    if ('width' in coord) {
      const c = coord as ComponentCoordinates
      result[id] = { x: c.x + dx, y: c.y + dy, width: c.width, height: c.height }
    }
  }
  return result
}

function computeCanvas(coordinates: CoordinateMap): { width: number; height: number } {
  let maxX = 0
  let maxY = 0
  for (const coord of Object.values(coordinates)) {
    if ('width' in coord) {
      const c = coord as ComponentCoordinates
      maxX = Math.max(maxX, c.x + c.width)
      maxY = Math.max(maxY, c.y + c.height)
    }
  }
  return {
    width:  Math.max(maxX + MIN_PADDING, CANVAS_INITIAL_WIDTH),
    height: maxY + MIN_PADDING,
  }
}

// Re-export for use in utils — avoids circular import
export type { Component }
