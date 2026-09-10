import { inject, type Component, type InjectionKey } from 'vue'
import type MinecraftAssets from 'minecraft-asset-loader'
import type { ManifestVersion, VersionDetails } from 'minecraft-asset-loader'
import type { CompareLink, CompareFact } from '@/components/VersionCompare.vue'
import type { DeltaResult } from '@/delta_providers'
import type { VersionContent } from '@/delta_providers/versions'
import type { Renderable } from '@/types'

export interface Equivalence {
  test(path: string): boolean
  kind: 'versionless'
}

export interface Edition {
  id: string
  name: string
  typeName?: (type: string) => string
  typeTip?: string
  readonly assets: MinecraftAssets
  lineSegments: number
  tooltip?: Component
  summary?: Component
  overview?: (version: ManifestVersion, details: VersionDetails) => Promise<{ facts: CompareFact[], links: CompareLink[] }>
  between?: (a: VersionDetails, b: VersionDetails) => Renderable[]
  afterLoad?: (content: VersionContent) => Promise<void>
  equivalences?: Equivalence[]
  animation?: (dr: DeltaResult, version: string, path: string) => Promise<string | null>
}

export const EDITION: InjectionKey<Edition> = Symbol('edition')

export function typeName(edition: Edition, type: string) {
  return edition.typeName?.(type) ?? type
}

export function useEdition(): Edition {
  const edition = inject(EDITION)
  if (!edition) throw new Error('No edition provided')
  return edition
}
