/**
 * Rendering pipeline.
 *
 * Stages:
 *   1. Space Manager  — graph layout + coordinate assignment (ELK)
 *   2. Local Repair   — fix small overlaps / negative coords in-place
 *   3. Validation     — geometric warnings (never blocks rendering)
 *   4. Workflow Engine — invoke plugin renderers, emit SVG
 *
 * Repair runs before rendering so the workflow engine always receives
 * clean coordinates.  Validation runs after repair so the warning log
 * reflects the final state.
 */
import type { DiagramJSON } from '../types'
import type { ComponentCoordinates } from '../types/plugin'
import { runSpaceManager, isSpaceManagerError } from './space-manager'
import { runWorkflowEngine, isWorkflowEngineError } from './workflow-engine'
import { runGeometricValidator } from './validator/geometric'
import { repairLayout } from './validator/repair'
import { routeConnectors } from './space-manager/route-edges'
import { CANVAS_INITIAL_WIDTH, MIN_PADDING } from './space-manager/constants'

export type PipelineResult =
  | { ok: true;  svg: string }
  | { ok: false; error: string }

export async function runPipeline(diagram: DiagramJSON): Promise<PipelineResult> {
  // Stage 1 — Space Manager: layout + coordinates
  const spaceResult = await runSpaceManager(diagram)
  if (isSpaceManagerError(spaceResult)) {
    return { ok: false, error: `Layout failed: ${spaceResult.detail}` }
  }

  // Stage 2 — Local repair: nudge overlapping / out-of-bounds nodes in-place.
  // Modifies spaceResult.coordinates directly — no re-layout needed.
  repairLayout(spaceResult.diagram, spaceResult.coordinates)

  // Stage 2b — Route all connectors from final node positions.
  routeConnectors(spaceResult.diagram, spaceResult.coordinates)

  // Stage 2d — Recompute canvas from final positions.
  // repairLayout can nudge nodes beyond the canvas computed in Stage 1.
  spaceResult.canvas = recomputeCanvas(spaceResult.coordinates)

  // Stage 3 — Geometric validator: log warnings about remaining issues
  runGeometricValidator(
    spaceResult.diagram,
    spaceResult.coordinates,
    spaceResult.canvas
  )

  // Stage 4 — Workflow Engine: render SVG from repaired coordinates
  const engineResult = runWorkflowEngine(spaceResult, diagram.diagram_style)
  if (isWorkflowEngineError(engineResult)) {
    return { ok: false, error: `Render failed [${engineResult.failure_reason}]: ${engineResult.detail}` }
  }

  return { ok: true, svg: engineResult.svg }
}

function recomputeCanvas(coordinates: Record<string, unknown>): { width: number; height: number } {
  let maxX = 0, maxY = 0
  for (const coord of Object.values(coordinates)) {
    if (coord && typeof coord === 'object' && 'width' in coord) {
      const c = coord as ComponentCoordinates
      maxX = Math.max(maxX, c.x + c.width)
      maxY = Math.max(maxY, c.y + c.height)
    }
  }
  return {
    width:  Math.max(maxX + MIN_PADDING, CANVAS_INITIAL_WIDTH),
    height: maxY + MIN_PADDING,
  }
}
