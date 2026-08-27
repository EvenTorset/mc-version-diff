import type { ProgressList } from '@/components/progressList'
import type { DeltaTrackState } from './states'
import type { Renderable, StaticOrAsync } from '@/types'

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

export interface DeltaProvider<T> {
  /** The display name of the provider */
  name: string
  /**
   * Options for controlling how the Custom provider will use this provider as
   * a comparator. If absent, the provider will not be available as a
   * comparator for the Custom provider.
   */
  custom?: {
    /**
     * Comma-separated list of unique file type specifiers that the provider
     * can work with. Used by the Custom provider to filter uploaded files.
     */
    accept?: string
    /** Options that will add URL query arguments */
    options?: {
      label: string
      tooltip: Renderable
      queryParam: string
      type: 'bool' // additions need implementation in CustomSelector.vue
      default: boolean
    }[]
    /** Pre-processing step done before comparison */
    preprocess(
      a: string,
      b: string,
      contentA: Uint8Array<ArrayBuffer>,
      contentB: Uint8Array<ArrayBuffer>,
      progressDisplay: ProgressList
    ): Promise<{
      contentA: T
      contentB: T
    }>
  }
  /** A list of categories to show in the delta sidebar */
  categories: StaticOrAsync<DeltaProviderCategory[]>
  /** The version selector on the home page. Shown when the provider's tab is selected. */
  selector(): Promise<Renderable> | Renderable
  /** The header at the top of the delta page */
  header(a: string, b: string): Promise<Renderable> | Renderable
  /** Fetches the content of two versions from their IDs */
  fetch(a: string, b: string, progressDisplay: ProgressList): Promise<{
    contentA: T
    contentB: T
  }>
  /** Compares two versions */
  compare(
    a: string,
    b: string,
    contentA: T,
    contentB: T,
    progressDisplay: ProgressList,
  ): Promise<DeltaResult>
}

await import('./mcje')
await import('./custom')
