import { resolveStaticOrSync } from '@/util/resolveToStatic'
import type { DeltaProvider, DeltaProviderCategory, DeltaResult, DeltaTrack } from '.'

const cache = new WeakMap<DeltaResult, Map<string, DeltaProviderCategory | null>>()

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
