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

  const family = dr.edition.family ?? dr.edition.id
  let found: Viewer | null = null
  for (const [ , viewer ] of VIEWERS) {
    if ((!viewer.edition || viewer.edition === family) && viewer.test(dr, track)) {
      found = viewer
      break
    }
  }
  results.set(track.id, found)
  return found
}
