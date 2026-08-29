import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import type { Viewer } from '.'

const VIEWERS: Map<string, Viewer> = new Map()

export function registerViewer(id: string, viewer: Viewer) {
  VIEWERS.set(id, viewer)
}

const cache = new WeakMap<DeltaResult, Map<string, Viewer | null>>()

export function getViewer(dr: DeltaResult, track: DeltaTrack): Viewer | null {
  let results = cache.get(dr)
  if (!results) cache.set(dr, results = new Map())

  const cached = results.get(track.id)
  if (cached !== undefined) return cached

  let found: Viewer | null = null
  for (const [ , viewer ] of VIEWERS) {
    if (viewer.test(dr, track)) {
      found = viewer
      break
    }
  }
  results.set(track.id, found)
  return found
}
