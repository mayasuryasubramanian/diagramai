// Shared SVG utilities for all plugins

const NS = 'http://www.w3.org/2000/svg'

export function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v))
  }
  return node
}

// Theme: semantic category → stroke + fill colors
const THEME: Record<string, { stroke: string; fill: string; text: string }> = {
  infrastructure: { stroke: '#3b82f6', fill: '#1e3a5f', text: '#f1f5f9' },
  application:    { stroke: '#8b5cf6', fill: '#2d1b69', text: '#f1f5f9' },
  messaging:      { stroke: '#f59e0b', fill: '#451a03', text: '#f1f5f9' },
  security:       { stroke: '#ef4444', fill: '#450a0a', text: '#f1f5f9' },
  actor:          { stroke: '#10b981', fill: '#022c22', text: '#f1f5f9' },
  brand:          { stroke: '#6366f1', fill: '#1e1b4b', text: '#f1f5f9' },
  external:       { stroke: '#6b7280', fill: '#1f2937', text: '#f1f5f9' },
  neutral:        { stroke: '#64748b', fill: '#1e293b', text: '#f1f5f9' },
}

export function theme(category: string) {
  return THEME[category] ?? THEME['neutral']
}

// Centered text inside a bounding box.
// The Space Manager already sizes every box to fit its label, so truncation
// is intentionally avoided here. The font size default matches BODY_FONT_SIZE
// (12px) so the rendering is consistent with the sizing estimates.
export function centeredText(
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  fontSize = 12
): SVGTextElement {
  const t = el('text', {
    x: x + width / 2,
    y: y + height / 2,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    fill: color,
    'font-size': fontSize,
    'font-family': 'system-ui, sans-serif',
  })
  t.textContent = label
  return t
}

// Arrowhead triangle points given last two waypoint coords
export function arrowheadPoints(
  x1: number, y1: number,
  x2: number, y2: number,
  size = 10
): string {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const ax = x2 - size * Math.cos(angle - Math.PI / 6)
  const bx = x2 - size * Math.cos(angle + Math.PI / 6)
  const ay = y2 - size * Math.sin(angle - Math.PI / 6)
  const by = y2 - size * Math.sin(angle + Math.PI / 6)
  return `${x2},${y2} ${ax},${ay} ${bx},${by}`
}

// Waypoints array → SVG path d attribute
export function waypointsToPath(waypoints: Array<{ x: number; y: number }>): string {
  if (waypoints.length < 2) return ''
  const [first, ...rest] = waypoints
  return `M ${first.x} ${first.y} ` + rest.map(p => `L ${p.x} ${p.y}`).join(' ')
}
