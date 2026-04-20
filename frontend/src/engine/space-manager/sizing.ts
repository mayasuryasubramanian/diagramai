/**
 * Content-driven component sizing.
 *
 * The Space Manager calls these utilities in Phase 1 to assign concrete
 * dimensions to every component before the layout pass begins.
 * Sizes are driven by the component's actual content (label length, visual
 * form constraints) with the plugin's guiding sizes as a floor.
 */

import type { Component } from '../../types/diagram'
import type { ComponentSize } from '../../types/diagram'
import type { Plugin } from '../../types/plugin'
import {
  BODY_FONT_SIZE,
  LABEL_FONT_SIZE,
  AVG_CHAR_WIDTH,
  TEXT_PADDING_H,
  LABEL_CLEARANCE,
} from './constants'

export type SizeMode = 'stressed' | 'normal' | 'liberal'

/**
 * Estimate the pixel width of a string rendered in system-ui at the given font size.
 * Uses the AVG_CHAR_WIDTH font metric — accurate enough for layout planning.
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  return Math.ceil(text.length * fontSize * AVG_CHAR_WIDTH)
}

/**
 * Compute the concrete size for a component instance.
 *
 * - For connectors (visual_form === 'line') and overlays: always 0×0.
 * - For all others: width = max(plugin guide, label-driven width); height = plugin guide.
 *   This ensures a box is never too narrow to show its label, while still
 *   respecting the plugin's minimum proportions.
 */
export function computeComponentSize(
  component: Component,
  plugin: Plugin,
  mode: SizeMode
): ComponentSize {
  if (plugin.visual_form === 'line' || plugin.visual_form === 'overlay') {
    return { w: 0, h: 0, locked: false }
  }

  const guide = plugin.sizes[mode]
  const label = (component.props['label'] as string | undefined) ?? ''

  // If the plugin owns its sizing logic, delegate entirely to it.
  if (plugin.computeSize) {
    return { ...plugin.computeSize(label, mode), locked: false }
  }

  // Default: width must fit the label text; height follows the guide.
  const rawLabelW = estimateTextWidth(label, BODY_FONT_SIZE) + TEXT_PADDING_H
  const w = Math.max(guide.w, rawLabelW)

  // Height follows the guide — single-line labels don't need dynamic height
  const h = guide.h

  return { w, h, locked: false }
}

/**
 * Compute the minimum gap required between two horizontally adjacent nodes,
 * based on the labels of any connectors running between them.
 * If no labeled connector exists between the pair, returns 0 (caller uses MIN_GAP).
 */
export function requiredHorizontalGap(
  srcId: string,
  tgtId: string,
  connectors: Component[]
): number {
  let maxLabelW = 0
  for (const conn of connectors) {
    const p = conn.props as { from?: string; to?: string; label?: string }
    if (p.from === srcId && p.to === tgtId && p.label) {
      maxLabelW = Math.max(maxLabelW, estimateTextWidth(p.label, LABEL_FONT_SIZE))
    }
  }
  return maxLabelW > 0 ? maxLabelW + LABEL_CLEARANCE * 2 : 0
}

/**
 * Compute the minimum gap required between two vertically adjacent nodes,
 * based on whether a labeled connector runs between them.
 * Arrow labels on vertical paths float above the midpoint of the gap,
 * so the gap must be at least 2× the label vertical offset to avoid
 * overlapping either box.
 *
 * Label vertical offset = LABEL_FONT_SIZE + 4 px (from arrow plugin rendering).
 */
export function requiredVerticalGap(
  srcId: string,
  tgtId: string,
  connectors: Component[]
): number {
  const LABEL_OFFSET = LABEL_FONT_SIZE + 4  // how far above midpoint the label sits
  for (const conn of connectors) {
    const p = conn.props as { from?: string; to?: string; label?: string }
    if (p.from === srcId && p.to === tgtId && p.label) {
      return LABEL_OFFSET * 2 + 8  // enough room to clear both adjacent boxes
    }
  }
  return 0
}
