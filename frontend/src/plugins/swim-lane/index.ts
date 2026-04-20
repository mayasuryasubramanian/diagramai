import type { Plugin } from '../../types'
import type { ComponentCoordinates } from '../../types/plugin'
import { el, theme } from '../utils/svg'

const swimLane: Plugin = {
  name: 'swim-lane',
  description: 'A horizontal band that groups related components by role, team, or system. Use when the user describes lanes, phases, or ownership boundaries.',
  visual_form: 'band',
  // Band width always stretches to fill the canvas; height is driven by children.
  // These are minimum heights before child sizing is applied.
  sizes: {
    stressed: { w: 0, h:  60 },
    normal:   { w: 0, h:  80 },
    liberal:  { w: 0, h: 120 },
  },
  version: '1.0.0',
  feedback_options: [
    'Lane label is wrong',
    'Wrong components in this lane',
    'Lane color is wrong',
    'Lanes are in the wrong order',
  ],
  supported_animations: ['none', 'fade-in'],
  schema: {
    type: 'object',
    properties: {
      label:          { type: 'string', description: 'Lane name displayed on the left side' },
      theme_category: { type: 'string', description: 'Semantic color category', default: 'neutral' },
      animation:      { type: 'object', description: 'Optional animation' },
    },
    required: ['label'],
  },

  render(component, coordinates, _context) {
    const { label, theme_category } = component as { label: string; theme_category?: string }
    const { x, y, width, height } = coordinates as ComponentCoordinates
    const colors = theme(theme_category ?? 'neutral')

    const headerWidth = 40
    const g = el('g')

    // Lane background
    const bg = el('rect', {
      x, y, width, height,
      fill: colors.fill,
      stroke: colors.stroke,
      'stroke-width': 1,
      opacity: 0.4,
    })

    // Header strip on the left
    const header = el('rect', {
      x, y,
      width: headerWidth,
      height,
      fill: colors.stroke,
      opacity: 0.25,
    })

    // Vertical label rotated in header
    const text = el('text', {
      x: x + headerWidth / 2,
      y: y + height / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      fill: colors.text,
      'font-size': 12,
      'font-family': 'system-ui, sans-serif',
      'font-weight': '600',
      transform: `rotate(-90, ${x + headerWidth / 2}, ${y + height / 2})`,
    })

    const maxChars = Math.floor(height / 8)
    text.textContent = label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label

    g.appendChild(bg)
    g.appendChild(header)
    g.appendChild(text)
    return g
  },
}

export default swimLane
