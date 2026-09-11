import { resolveStaticOrSync } from '@/util/resolveToStatic'
import type { DeltaProvider, DeltaProviderCategory, DeltaResult, DeltaTrack } from '.'
import { DeltaTrackState } from './states'

const cache = new WeakMap<DeltaResult, Map<string, DeltaProviderCategory | null>>()
const expandCache = new WeakMap<DeltaResult, Map<DeltaProviderCategory, boolean>>()

export function getTrackCategory(
  provider: DeltaProvider<unknown>,
  dr: DeltaResult,
  track: DeltaTrack
): DeltaProviderCategory | null {
  let results = cache.get(dr)
  if (!results) cache.set(dr, results = new Map())

  const cached = results.get(track.id)
  if (cached !== undefined) return cached

  const categories = resolveStaticOrSync(provider.categories)
  const category = categories.find(c => c.test(dr, track)) ?? null
  results.set(track.id, category)
  return category
}

export function categoryExpands(dr: DeltaResult, category: DeltaProviderCategory | null): boolean {
  if (!category) return false
  if (typeof category.expand !== 'function') return category.expand ?? false

  let results = expandCache.get(dr)
  if (!results) expandCache.set(dr, results = new Map())

  const cached = results.get(category)
  if (cached !== undefined) return cached

  const result = category.expand(dr, dr.tracks.filter(track => dr.getCategory(track) === category))
  results.set(category, result)
  return result
}

export function expandSingleLanguage(_dr: DeltaResult, tracks: DeltaTrack[]) {
  return tracks.filter(track => (
    (track.state === DeltaTrackState.Added || track.state === DeltaTrackState.Edited)
    && !track.id.endsWith('/deprecated.json')
  )).length <= 1
}
