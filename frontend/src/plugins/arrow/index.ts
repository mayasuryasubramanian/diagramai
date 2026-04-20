import type { Plugin } from '../../types'
import type { ConnectionCoordinates } from '../../types/plugin'
import { el, theme, arrowheadPoints, waypointsToPath } from '../utils/svg'
import { LABEL_FONT_SIZE, LABEL_CLEARANCE } from '../../engine/space-manager/constants'
import { estimateTextWidth } from '../../engine/space-manager/sizing'

interface ArrowProps {
  from: string
  to: string
  semantic?: string
  label?: string
  theme_category?: string
  style?: {
    line?: 'solid' | 'dashed' | 'dotted'
    direction?: 'forward' | 'backward' | 'bidirectional' | 'none'
    weight?: 'normal' | 'heavy' | 'light'
  }
}

const arrow: Plugin = {
  name: 'arrow',
  description: 'A directed or undirected connector between two components. Use whenever the user describes a relationship, flow, dependency, or communication between components.',
  visual_form: 'line',
  // Connectors have no bounding box — all three modes are zero
  sizes: {
    stressed: { w: 0, h: 0 },
    normal:   { w: 0, h: 0 },
    liberal:  { w: 0, h: 0 },
  },
  version: '1.0.0',
  feedback_options: [
    'Arrow points the wrong way',
    'Arrow connects the wrong components',
    'Arrow label is wrong',
    'Should be dashed not solid',
    'Should be solid not dashed',
    'Arrow is missing',
  ],
  supported_animations: ['none', 'flow', 'traverse'],
  schema: {
    type: 'object',
    properties: {
      from:           { type: 'string', description: 'ID of the source component' },
      to:             { type: 'string', description: 'ID of the target component' },
      semantic:       { type: 'string', description: 'Plain English description of the relationship' },
      label:          { type: 'string', description: 'Optional short label displayed on the arrow' },
      theme_category: { type: 'string', description: 'Semantic color category', default: 'neutral' },
      style: {
        type: 'object',
        description: 'Visual style of the connector',
        properties: {
          line:      { type: 'string', enum: ['solid', 'dashed', 'dotted'], default: 'solid' },
          direction: { type: 'string', enum: ['forward', 'backward', 'bidirectional', 'none'], default: 'forward' },
          weight:    { type: 'string', enum: ['normal', 'heavy', 'light'], default: 'normal' },
        },
      },
    },
    required: ['from', 'to'],
  },

  render(component, coordinates, _context) {
    const props = component as unknown as ArrowProps
    const { waypoints } = coordinates as ConnectionCoordinates

    if (waypoints.length < 2) return el('g')

    const colors = theme(props.theme_category ?? 'neutral')
    const lineStyle = props.style?.line ?? 'solid'
    const direction = props.style?.direction ?? 'forward'
    const weight = props.style?.weight ?? 'normal'

    const strokeWidth = weight === 'heavy' ? 2.5 : weight === 'light' ? 1 : 1.5
    const dashArray =
      lineStyle === 'dashed' ? '8 4' :
      lineStyle === 'dotted' ? '2 4' : 'none'

    const g = el('g')

    // Path
    const path = el('path', {
      d: waypointsToPath(waypoints),
      fill: 'none',
      stroke: colors.stroke,
      'stroke-width': strokeWidth,
    })
    if (dashArray !== 'none') path.setAttribute('stroke-dasharray', dashArray)
    g.appendChild(path)

    // Arrowheads
    const first = waypoints[0]
    const second = waypoints[1]
    const last = waypoints[waypoints.length - 1]
    const prev = waypoints[waypoints.length - 2]

    if (direction === 'forward' || direction === 'bidirectional') {
      const head = el('polygon', {
        points: arrowheadPoints(prev.x, prev.y, last.x, last.y),
        fill: colors.stroke,
      })
      g.appendChild(head)
    }

    if (direction === 'backward' || direction === 'bidirectional') {
      const head = el('polygon', {
        points: arrowheadPoints(second.x, second.y, first.x, first.y),
        fill: colors.stroke,
      })
      g.appendChild(head)
    }

    // Optional midpoint label
    if (props.label) {
      const labelW = estimateTextWidth(props.label, LABEL_FONT_SIZE) + LABEL_CLEARANCE * 2
      const labelH = LABEL_FONT_SIZE + 4  // font size + vertical breathing room

      // Preferred: use ELK's own label position (it knows the full path geometry).
      // Fallback: derive from waypoints using segment-direction heuristic.
      const coord = coordinates as ConnectionCoordinates
      let cx: number, cy: number

      if (coord.labelPosition) {
        // ELK gives us the label centre directly — use it.
        cx = coord.labelPosition.x
        cy = coord.labelPosition.y
      } else {
        // Find middle segment midpoint as fallback
        const i1 = Math.floor((waypoints.length - 1) / 2)
        const i2 = Math.ceil((waypoints.length - 1) / 2)
        cx = (waypoints[i1].x + waypoints[i2].x) / 2
        cy = (waypoints[i1].y + waypoints[i2].y) / 2
      }

      // Offset the label background perpendicular to the segment so it clears
      // the arrow line.  Check the dominant axis of the middle segment.
      const i1 = Math.floor((waypoints.length - 1) / 2)
      const i2 = Math.ceil((waypoints.length - 1) / 2)
      const segDx = Math.abs(waypoints[i2].x - waypoints[i1].x)
      const segDy = Math.abs(waypoints[i2].y - waypoints[i1].y)
      const segIsHorizontal = segDx >= segDy

      let bgX: number, bgY: number, textX: number, textY: number
      if (segIsHorizontal) {
        // Horizontal segment → float above
        bgX = cx - labelW / 2
        bgY = cy - labelH - 4
        textX = cx
        textY = bgY + labelH - 3
      } else {
        // Vertical segment → float to the right (avoids overlapping nodes above/below)
        bgX = cx + 6
        bgY = cy - labelH / 2
        textX = bgX + labelW / 2
        textY = bgY + labelH - 3
      }

      const bg = el('rect', {
        x: bgX,
        y: bgY,
        width: labelW,
        height: labelH,
        rx: 3,
        fill: '#0f172a',
        opacity: 0.85,
      })

      const lbl = el('text', {
        x: textX,
        y: textY,
        'text-anchor': 'middle',
        fill: colors.text,
        'font-size': LABEL_FONT_SIZE,
        'font-family': 'system-ui, sans-serif',
      })
      lbl.textContent = props.label

      g.appendChild(bg)
      g.appendChild(lbl)
    }

    return g
  },
}

export default arrow
