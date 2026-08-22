import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import type { Viewer } from '.'

const VIEWERS: Map<string, Viewer> = new Map()

export function registerViewer(id: string, viewer: Viewer) {
  VIEWERS.set(id, viewer)
}

export function getViewer(dr: DeltaResult, track: DeltaTrack): Viewer | null {
  for (const [ , viewer ] of VIEWERS) {
    if (viewer.test(dr, track)) return viewer
  }
  return null
}
