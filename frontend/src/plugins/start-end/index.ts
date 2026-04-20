import type { Plugin } from '../../types'
import type { ComponentCoordinates } from '../../types/plugin'
import { el, theme, centeredText } from '../utils/svg'

const startEnd: Plugin = {
  name: 'start-end',
  description: 'A rounded rectangle (stadium shape) representing the start or end of a flow. Use for the first and last steps of a flowchart or process.',
  visual_form: 'pill',
  sizes: {
    stressed: { w:  80, h: 30 },
    normal:   { w: 120, h: 40 },
    liberal:  { w: 160, h: 52 },
  },
  version: '1.0.0',
  feedback_options: [
    'Should be Start not End',
    'Should be End not Start',
    'Wrong label text',
    'Wrong position in flow',
  ],
  supported_animations: ['none', 'fade-in', 'pulse'],
  schema: {
    type: 'object',
    properties: {
      label:          { type: 'string', description: 'Start or End (or custom label)' },
      theme_category: { type: 'string', description: 'Semantic color category', default: 'neutral' },
      animation:      { type: 'object', description: 'Optional animation' },
    },
    required: ['label'],
  },

  render(component, coordinates, context) {
    const { label, theme_category } = component as { label: string; theme_category?: string }
    const { x, y, width, height } = coordinates as ComponentCoordinates
    const colors = theme(theme_category ?? 'neutral')

    // Fully rounded — rx = half of height
    const rx = height / 2

    const g = el('g')

    const rect = el('rect', {
      x, y, width, height,
      rx, ry: rx,
      fill: colors.fill,
      stroke: colors.stroke,
      'stroke-width': 1.5,
    })

    const text = centeredText(label, x, y, width, height, colors.text)

    if (context.diagram_style === 'handwritten') {
      rect.setAttribute('stroke-dasharray', '4 2')
    }

    g.appendChild(rect)
    g.appendChild(text)
    return g
  },
}

export default startEnd
