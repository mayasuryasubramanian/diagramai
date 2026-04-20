// Space Manager types — from space-manager-interface spec v0.3

import type { DiagramJSON } from './diagram'
import type { ComponentCoordinates, ConnectionCoordinates } from './plugin'

export type CoordinateMap = Record<string, ComponentCoordinates | ConnectionCoordinates>

// Outcome of a layout pass — whether the diagram fits the canvas cleanly
export type FitStatus =
  | { ok: true }
  | { ok: 'partial'; reason: string; affected: string[] }
  | { ok: false;    reason: string; options: string[]  }

export interface SpaceManagerOutput {
  diagram:     DiagramJSON      // updated — all component sizes confirmed and written back
  coordinates: CoordinateMap
  canvas:      { width: number; height: number }  // computed from content, not fixed
  fit_status:  FitStatus
}

export interface SpaceManagerError {
  stage: 'space-manager'
  constraint_violated: string
  components_involved: string[]
  detail: string
}
