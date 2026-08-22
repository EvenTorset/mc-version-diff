import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import type { Renderable } from '@/types'

export type Viewer = {
  predictedHeight?: number
  test(dr: DeltaResult, track: DeltaTrack): boolean
  render(dr: DeltaResult, track: DeltaTrack): Promise<Renderable> | Renderable
}

await import('./deprecated_lang')
await import('./lang')
await import('./mcje_structure')
await import('./mcje_model')
await import('./text')
await import('./png')
