import { resolveStaticOrSync } from '@/util/resolveToStatic'
import type { DeltaProvider, DeltaProviderCategory, DeltaResult, DeltaTrack } from '.'

export function getTrackCategory(
  provider: DeltaProvider<unknown>,
  dr: DeltaResult,
  track: DeltaTrack
): DeltaProviderCategory | null {
  const categories = resolveStaticOrSync(provider.categories)
  return categories.find(c => c.test(dr, track)) ?? null
}
