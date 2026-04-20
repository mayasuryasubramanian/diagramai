// Plugin contract types — from plugin-contract spec v0.3

export type VisualForm =
  | 'box'
  | 'cylinder'
  | 'circle'
  | 'band'
  | 'pill'
  | 'diamond'
  | 'cloud'
  | 'stack'
  | 'shield'
  | 'line'
  | 'overlay'
  | 'custom'

export type AnimationType =
  | 'none'
  | 'flow'
  | 'traverse'
  | 'pulse'
  | 'glow'
  | 'highlight'
  | 'fade-in'
  | 'draw'
  | 'spin'
  | 'blink'

export interface AnimationProp {
  type: AnimationType
  speed: 'slow' | 'normal' | 'fast'
  repeat: 'once' | 'loop'
  delay: number  // seconds
}

// DiagramStyle is re-exported from diagram.ts — import from there

import type { DiagramStyle } from './diagram'

export interface RenderContext {
  diagram_style: DiagramStyle
}

export interface ComponentCoordinates {
  x: number
  y: number
  width: number
  height: number
}

export interface ConnectionCoordinates {
  waypoints:      Array<{ x: number; y: number }>
  // ELK-computed label centre — used by the arrow renderer instead of
  // re-deriving it from waypoints (which breaks on non-straight paths).
  labelPosition?: { x: number; y: number }
}

export type Coordinates = ComponentCoordinates | ConnectionCoordinates

export type RenderFn = (
  component: Record<string, unknown>,
  coordinates: Coordinates,
  context: RenderContext
) => SVGElement | SVGElement[]

// Three guiding sizes per plugin, used by Space Manager to pick based on available space
export interface ComponentSizes {
  stressed: { w: number; h: number }  // smallest legible — used when space is tight
  normal:   { w: number; h: number }  // comfortable default
  liberal:  { w: number; h: number }  // spacious — used when space is plentiful
}

// The text-safe area within a component's bounding box.
// Coordinates are relative to the bounding box origin (0,0).
export interface TextArea {
  x: number   // offset from bounding box left
  y: number   // offset from bounding box top
  w: number   // usable text width
  h: number   // usable text height
}

export interface Plugin {
  name: string
  description: string
  visual_form: VisualForm
  sizes: ComponentSizes              // guiding minimum sizes for Space Manager
  schema: Record<string, unknown>   // JSON Schema draft-07
  render: RenderFn
  feedback_options: string[]        // max 6
  version: string                   // semver
  supported_animations: AnimationType[]

  /**
   * Return the minimum bounding-box dimensions needed to display `label` at
   * the given size mode.  The Space Manager calls this instead of guessing
   * shape-specific geometry.  If absent, Space Manager uses the default
   * formula (label width + padding, guide height).
   */
  computeSize?: (label: string, mode: 'stressed' | 'normal' | 'liberal') => { w: number; h: number }

  /**
   * Return the text-safe rectangle inside a bounding box of (bw × bh).
   * Renderers call this to position labels consistently with how the Space
   * Manager sized the component.  If absent, the full bounding box is used.
   */
  getTextArea?: (bw: number, bh: number) => TextArea
}
