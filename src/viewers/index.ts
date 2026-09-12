import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import type { Renderable } from '@/types'

export type Viewer = {
  edition?: string
  predictedHeight?: number
  test(dr: DeltaResult, track: DeltaTrack): boolean
  render(dr: DeltaResult, track: DeltaTrack): Promise<Renderable> | Renderable
}

await import('./sound')
await import('./deprecated_lang')
await import('./lang')
await import('./mcje/structure')
await import('./mcje/loot_table')
await import('./mcje/recipe')
await import('./mcje/tag')
await import('./mcje/sounds')
await import('./mcje/unifont')
await import('./mcje/model')
await import('./mcbe/model')
await import('./mcbe/animation')
await import('./mcbe/particle')
await import('./mcbe/ui')
await import('./image')
await import('./mcje/mcmeta')
await import('./text') // fallback, must load last
