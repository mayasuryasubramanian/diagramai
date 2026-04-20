import type { Plugin, TextArea, ComponentCoordinates } from '../../types/plugin'
import { el, theme, centeredText } from '../utils/svg'
import { estimateTextWidth } from '../../engine/space-manager/sizing'
import { BODY_FONT_SIZE, TEXT_PADDING_H } from '../../engine/space-manager/constants'

// A diamond's inner text-safe area is a rectangle whose width is ~65% of the
// bounding box and whose height is ~50%.  These ratios are the only place
// that encodes diamond geometry — sizing.ts and the renderer both derive from
// getTextArea so there is a single source of truth.
const TEXT_W_RATIO = 0.65
const TEXT_H_RATIO = 0.50

const decisionBox: Plugin = {
  name: 'decision-box',
  description: 'A diamond shape representing a decision point or condition. Use when the user describes a yes/no question, branch, or conditional check.',
  visual_form: 'diamond',
  sizes: {
    stressed: { w:  80, h: 56 },
    normal:   { w: 120, h: 80 },
    liberal:  { w: 160, h: 104 },
  },

  // Return the bounding box that gives the label enough inner area.
  // Space Manager calls this so it never has to know about diamond geometry.
  computeSize(label, mode) {
    const guide = this.sizes[mode]
    const labelW = estimateTextWidth(label, BODY_FONT_SIZE) + TEXT_PADDING_H
    const w = Math.max(guide.w, Math.ceil(labelW / TEXT_W_RATIO))
    // Keep height proportional to width so the diamond looks balanced.
    const h = Math.max(guide.h, Math.ceil((w * guide.h) / guide.w))
    return { w, h }
  },

  // Return the text-safe rectangle within the bounding box.
  // Renderer uses this — the 0.65 constant only lives here.
  getTextArea(bw, bh): TextArea {
    const tw = bw * TEXT_W_RATIO
    const th = bh * TEXT_H_RATIO
    return {
      x: (bw - tw) / 2,
      y: (bh - th) / 2,
      w: tw,
      h: th,
    }
  },
  version: '1.0.0',
  feedback_options: [
    'Label text is wrong',
    'Wrong shape used — should not be a diamond',
    'Decision is in the wrong position',
    'Missing branch connection',
    'Branch labels are wrong',
  ],
  supported_animations: ['none', 'pulse', 'fade-in'],
  schema: {
    type: 'object',
    properties: {
      label:          { type: 'string', description: 'The question or condition text' },
      theme_category: { type: 'string', description: 'Semantic color category', default: 'neutral' },
      animation:      { type: 'object', description: 'Optional animation' },
    },
    required: ['label'],
  },

  render(component, coordinates, context) {
    const { label, theme_category } = component as { label: string; theme_category?: string }
    const { x, y, width, height } = coordinates as ComponentCoordinates
    const colors = theme(theme_category ?? 'neutral')

    const cx = x + width / 2
    const cy = y + height / 2

    // Diamond: top, right, bottom, left midpoints
    const points = `${cx},${y} ${x + width},${cy} ${cx},${y + height} ${x},${cy}`

    const g = el('g')

    const diamond = el('polygon', {
      points,
      fill: colors.fill,
      stroke: colors.stroke,
      'stroke-width': 1.5,
    })

    if (context.diagram_style === 'handwritten') {
      diamond.setAttribute('stroke-dasharray', '4 2')
    }

    // Text area is owned by getTextArea — no magic numbers here
    const ta = decisionBox.getTextArea!(width, height)
    const text = centeredText(label, x + ta.x, y + ta.y, ta.w, ta.h, colors.text)

    g.appendChild(diamond)
    g.appendChild(text)
    return g
  },
}

export default decisionBox
