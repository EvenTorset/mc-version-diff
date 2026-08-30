import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import type { Renderable } from '@/types'

export type Viewer = {
  predictedHeight?: number
  test(dr: DeltaResult, track: DeltaTrack): boolean
  render(dr: DeltaResult, track: DeltaTrack): Promise<Renderable> | Renderable
}

await import('./deprecated_lang')
await import('./lang')
await import('./mcje/structure')
await import('./mcje/loot_table')
await import('./mcje/recipe')
await import('./mcje/tag')
await import('./mcje/model')
await import('./png')
await import('./mcje/mcmeta')
await import('./text') // fallback, must load last
