import type { Component } from '../../types'
import type { ComponentCoordinates } from '../../types/plugin'
import { getPlugin } from '../../plugins/registry'

/**
 * Return the confirmed size of a component.
 * Space Manager Phase 1 always populates component.size before layout runs,
 * so this should always be present by the time layout functions call it.
 * The fallback (80×40) is a last resort for unexpected missing data.
 */
export function getSize(component: Component): { w: number; h: number } {
  if (component.size) {
    return { w: component.size.w, h: component.size.h }
  }
  // Fallback: should not normally be reached after Phase 1
  return { w: 80, h: 40 }
}

export function isConnector(component: Component): boolean {
  const plugin = getPlugin(component.type)
  return plugin?.visual_form === 'line'
}

export function isOverlay(component: Component): boolean {
  const plugin = getPlugin(component.type)
  return plugin?.visual_form === 'overlay'
}

export function isContainer(component: Component): boolean {
  const plugin = getPlugin(component.type)
  return plugin?.visual_form === 'band'
}

export function centerOf(c: ComponentCoordinates): { x: number; y: number } {
  return { x: c.x + c.width / 2, y: c.y + c.height / 2 }
}
