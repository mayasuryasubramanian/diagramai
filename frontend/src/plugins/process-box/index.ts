import type { Plugin } from '../../types'
import type { ComponentCoordinates } from '../../types/plugin'
import { el, theme, centeredText } from '../utils/svg'

const processBox: Plugin = {
  name: 'process-box',
  description: 'A rectangle representing a process step, task, or action. Use for any operation the user describes as something that happens or is done.',
  visual_form: 'box',
  sizes: {
    stressed: { w: 100, h: 36 },
    normal:   { w: 160, h: 52 },
    liberal:  { w: 220, h: 70 },
  },
  version: '1.0.0',
  feedback_options: [
    'Label text is wrong',
    'Wrong shape used',
    'Box is in the wrong position',
    'Missing connection',
    'Color is wrong',
  ],
  supported_animations: ['none', 'pulse', 'glow', 'fade-in'],
  schema: {
    type: 'object',
    properties: {
      label:          { type: 'string', description: 'Text displayed inside the box' },
      theme_category: { type: 'string', description: 'Semantic color category', default: 'neutral' },
      animation:      { type: 'object', description: 'Optional animation', properties: {
        type:   { type: 'string' },
        speed:  { type: 'string' },
        repeat: { type: 'string' },
        delay:  { type: 'number' },
      }},
    },
    required: ['label'],
  },

  render(component, coordinates, context) {
    const { label, theme_category } = component as { label: string; theme_category?: string }
    const { x, y, width, height } = coordinates as ComponentCoordinates
    const colors = theme(theme_category ?? 'neutral')

    const g = el('g')

    const rect = el('rect', {
      x, y, width, height,
      rx: 4, ry: 4,
      fill: colors.fill,
      stroke: colors.stroke,
      'stroke-width': 1.5,
    })

    const text = centeredText(label, x, y, width, height, colors.text)

    if (context.diagram_style === 'handwritten') {
      rect.setAttribute('stroke-dasharray', '4 2')
      rect.setAttribute('rx', '6')
    }

    g.appendChild(rect)
    g.appendChild(text)
    return g
  },
}

export default processBox
