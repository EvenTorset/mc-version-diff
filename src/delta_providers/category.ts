import type { DeltaProvider, DeltaProviderCategory, DeltaResult, DeltaTrack } from '.'

export function getTrackCategory(provider: DeltaProvider, dr: DeltaResult, track: DeltaTrack): DeltaProviderCategory | null {
  return provider.categories.find(c => c.test(dr, track)) ?? null
}
