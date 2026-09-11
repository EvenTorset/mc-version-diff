import { inject, type Component, type InjectionKey } from 'vue'
import type MinecraftAssets from 'minecraft-asset-loader'
import type { ManifestVersion, VersionDetails } from 'minecraft-asset-loader'
import type { CompareLink, CompareFact } from '@/components/VersionCompare.vue'
import type { DeltaResult } from '@/delta_providers'
import type { VersionContent, VersionEntry } from '@/delta_providers/versions'
import type { Renderable } from '@/types'

export interface Equivalence {
  test(path: string): boolean
  kind: 'versionless'
}

export interface Edition {
  id: string
  family?: string
  name: string
  typeName?: (type: string) => string
  label?: (version: ManifestVersion) => string
  typeTip?: string
  readonly assets: MinecraftAssets
  lineSegments: number
  lazy?: boolean
  tooltip?: Component
  summary?: Component
  overview?: (version: ManifestVersion, details: VersionDetails) => Promise<{ facts: CompareFact[], links: CompareLink[] }>
  between?: (a: VersionDetails, b: VersionDetails) => Renderable[]
  expand?: (entries: VersionEntry[]) => Promise<VersionEntry[]>
  fallback?: {
    read(version: string, path: string): Promise<Uint8Array<ArrayBuffer> | null>
    list(version: string, path: string): Promise<string[]>
  }
  afterLoad?: (content: VersionContent) => Promise<void>
  equivalences?: Equivalence[]
  animation?: (dr: DeltaResult, version: string, path: string) => Promise<string | null>
}

export const EDITION: InjectionKey<Edition> = Symbol('edition')

export function typeName(edition: Edition, type: string) {
  return edition.typeName?.(type) ?? type
}

export function versionLabel(edition: Edition, version: ManifestVersion): string {
  return edition.label?.(version) ?? version.id
}

export function useEdition(): Edition {
  const edition = inject(EDITION)
  if (!edition) throw new Error('No edition provided')
  return edition
}
