import { inject, type Component, type InjectionKey } from 'vue'
import type MinecraftAssets from 'minecraft-asset-loader'
import type { ManifestVersion, VersionDetails } from 'minecraft-asset-loader'
import type { CompareLink, CompareFact } from '@/components/VersionCompare.vue'
import type { VersionContent } from '@/delta_providers/versions'
import type { Renderable } from '@/types'

export interface Edition {
  id: string
  name: string
  readonly assets: MinecraftAssets
  lineSegments: number
  tooltip?: Component
  summary?: Component
  overview?: (version: ManifestVersion, details: VersionDetails) => Promise<{ facts: CompareFact[], links: CompareLink[] }>
  between?: (a: VersionDetails, b: VersionDetails) => Renderable[]
  afterLoad?: (content: VersionContent) => Promise<void>
}

export const EDITION: InjectionKey<Edition> = Symbol('edition')

export function useEdition(): Edition {
  const edition = inject(EDITION)
  if (!edition) throw new Error('No edition provided')
  return edition
}
