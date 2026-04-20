/**
 * ELK-based layout — fallback when AI does not provide coordinates.
 * Extracts node positions only. Edge routing is handled by routeConnectors().
 */

import ELK from 'elkjs/lib/elk.bundled.js'
import type { ELK as ELKType, ElkNode } from 'elkjs'
import type { DiagramJSON, Component } from '../../types'
import type { CoordinateMap } from '../../types/space-manager'
import type { ComponentCoordinates } from '../../types/plugin'
import { getPlugin } from '../../plugins/registry'
import { getSize, isConnector, isOverlay } from './utils'
import { MIN_PADDING, LANE_HEADER, LANE_PADDING, LABEL_FONT_SIZE, LABEL_CLEARANCE } from './constants'
import { estimateTextWidth } from './sizing'

const elk: ELKType = new (ELK as new () => ELKType)()

export async function layoutWithElk(diagram: DiagramJSON): Promise<CoordinateMap> {
  const connectorComponents = diagram.components.filter(isConnector)
  const nodeComponents      = diagram.components.filter(c => !isConnector(c) && !isOverlay(c))
  const nodeIds             = new Set(nodeComponents.map(c => c.id))

  const childrenOf = new Map<string | null, Component[]>()
  childrenOf.set(null, [])
  for (const c of nodeComponents) {
    const parentKey = c.parent ?? null
    if (!childrenOf.has(parentKey)) childrenOf.set(parentKey, [])
    childrenOf.get(parentKey)!.push(c)
  }

  function buildElkNode(comp: Component): ElkNode {
    const { w, h } = getSize(comp)
    const children  = childrenOf.get(comp.id) ?? []

    if (children.length === 0) {
      return { id: comp.id, width: w, height: h }
    }

    const isBand  = getPlugin(comp.type)?.visual_form === 'band'
    const leftPad = isBand ? LANE_HEADER + LANE_PADDING : MIN_PADDING

    return {
      id: comp.id,
      layoutOptions: {
        'elk.algorithm':                             'layered',
        'elk.direction':                             'RIGHT',
        'elk.padding':                               `[top=${LANE_PADDING}, left=${leftPad}, bottom=${LANE_PADDING}, right=${MIN_PADDING}]`,
        'elk.spacing.nodeNode':                      String(MIN_PADDING),
        'elk.layered.spacing.nodeNodeBetweenLayers': String(MIN_PADDING),
      },
      children: children.map(buildElkNode),
    }
  }

  const topLevel    = childrenOf.get(null) ?? []
  const elkChildren = topLevel.map(buildElkNode)

  type ElkEdge = {
    id: string
    sources: string[]
    targets: string[]
    labels?: Array<{ id: string; text: string; width: number; height: number }>
  }

  const edges: ElkEdge[] = connectorComponents
    .filter(c => {
      const from = c.props['from'] as string | undefined
      const to   = c.props['to']   as string | undefined
      return from && to && nodeIds.has(from) && nodeIds.has(to)
    })
    .map(c => {
      const from  = c.props['from'] as string
      const to    = c.props['to']   as string
      const label = (c.props['label'] as string | undefined) ?? ''
      const edge: ElkEdge = { id: c.id, sources: [from], targets: [to] }
      if (label) {
        const labelW = estimateTextWidth(label, LABEL_FONT_SIZE) + LABEL_CLEARANCE * 2
        const labelH = LABEL_FONT_SIZE + 4
        edge.labels = [{ id: `${c.id}-lbl`, text: label, width: labelW, height: labelH }]
      }
      return edge
    })

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm':                             'layered',
      'elk.direction':                             'DOWN',
      'elk.padding':                               `[top=${MIN_PADDING}, left=${MIN_PADDING}, bottom=${MIN_PADDING}, right=${MIN_PADDING}]`,
      'elk.spacing.nodeNode':                      '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy':        'NETWORK_SIMPLEX',
      'elk.layered.cycleBreaking.strategy':        'MODEL_ORDER',
      'elk.layered.considerModelOrder.strategy':   'NODES_AND_EDGES',
    },
    children: elkChildren,
    edges,
  }

  const result = await elk.layout(elkGraph)

  const coords: CoordinateMap = {}

  function extractNodes(node: ElkNode, offsetX: number, offsetY: number): void {
    const absX = (node.x ?? 0) + offsetX
    const absY = (node.y ?? 0) + offsetY
    if (node.id !== 'root') {
      coords[node.id] = {
        x: absX, y: absY,
        width:  node.width  ?? 0,
        height: node.height ?? 0,
      } satisfies ComponentCoordinates
    }
    for (const child of node.children ?? []) {
      extractNodes(child, absX, absY)
    }
  }

  extractNodes(result, 0, 0)
  return coords
}
