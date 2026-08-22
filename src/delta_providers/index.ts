import type { ProgressList } from '@/components/progressList'
import type { DeltaTrackState } from './states'
import type { Renderable } from '@/types'

export type DeltaTrack = {
  id: string
  state: DeltaTrackState
  a: string
  b: string
}

export type DeltaResult = {
  a: string
  b: string
  tracks: DeltaTrack[]
  getEntry: (versionId: string, path: string | null) => Promise<Uint8Array<ArrayBuffer>>
  listEntries: (versionId: string, path: string) => Promise<string[]>
  getCategory: (track: DeltaTrack) => DeltaProviderCategory | null
}

export type DeltaProviderCategory = {
  /** The display name for this category */
  name: string
  /** Used to sort the list of category tabs in the UI */
  sort: number
  /** If true, the tracks in this category will automatically expand */
  expand?: boolean
  /** If true, enables the image display settings panel while the category is selected */
  isImages?: boolean
  /** Including this enables the copy button(s) on the track */
  mimeType?: (path: string) => string
  /** Used to check if a track belongs to this category */
  test(dr: DeltaResult, track: DeltaTrack): boolean
}

export interface DeltaProvider {
  name: string
  categories: DeltaProviderCategory[]
  selector(): Promise<Renderable> | Renderable
  header(a: string, b: string): Promise<Renderable> | Renderable
  compare(a: string, b: string, progressDisplay: ProgressList): Promise<DeltaResult>
}

await import('./mcje')
