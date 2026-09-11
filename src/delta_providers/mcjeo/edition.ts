import type { ManifestVersion } from 'minecraft-asset-loader'
import { ArrowDownload16Filled } from '@vicons/fluent'
import type { Edition } from '@/components/versions/edition'
import { formatBytes } from '@/util/bytes'
import { assets } from '../loader'
import { gameVersion, type GameVersion } from './estimate'
import { expandZips } from '../versions'
import { listFromJar, readFromJar } from './jar'
import MCJEOVersionTooltip from './MCJEOVersionTooltip.vue'
import MCJEOVersionFacts from './MCJEOVersionFacts.vue'

export type AssetsManifestVersion = ManifestVersion & {
  sha1: string
  url: string
  size: number
  totalSize: number
  first: string
  last: string
}

export function assetIndex(version: ManifestVersion): AssetsManifestVersion {
  return version as AssetsManifestVersion
}

export function assetsRange(version: ManifestVersion): string {
  const index = assetIndex(version)
  return index.first === index.last ? index.first : `${index.first} to ${index.last}`
}

export function assetsTag(version: ManifestVersion): string {
  const index = assetIndex(version)
  const from = gameVersion(index.first)
  const to = gameVersion(index.last)
  const show = (v: GameVersion) => v.exact ? v.text : `~${v.text}`
  if (from.text === to.text) return show(from.exact ? from : to)
  return `${show(from)} → ${show(to)}`
}

export function assetsLabel(version: ManifestVersion): string {
  return `${version.id}: ${assetsTag(version)}`
}

const TIPS = {
  size: 'Combined size of every object this index points at.',
  versions: 'The game versions that use this asset index.',
  index: 'The name Mojang gives this asset index. Versions sharing it share their assets.',
  type: 'Release indexes are used by a finished update. Snapshot indexes are only used by the weekly previews.',
}

export const javaAssetsEdition: Edition = {
  id: 'mcjeo',
  family: 'mcje',
  name: 'Java External',
  description: "Not all of Minecraft: Java Edition's assets live in the game jar. The larger ones are stored separately and reused across versions: sounds, panoramas, languages, fonts and the bundled resource packs. Each entry here is one of those shared sets.",
  label: assetsLabel,
  tag: assetsTag,
  typeTip: TIPS.type,
  get assets() {
    return assets('assets')
  },
  lineSegments: 1,
  lazy: true,
  expand: expandZips,
  fallback: {
    read: readFromJar,
    list: listFromJar,
  },
  tooltip: MCJEOVersionTooltip,
  summary: MCJEOVersionFacts,
  async overview(version) {
    const index = assetIndex(version)
    return {
      facts: [
        { label: 'Size', value: formatBytes(index.totalSize), tip: TIPS.size },
        { label: 'Versions', value: assetsRange(version), tip: TIPS.versions },
      ],
      links: [
        {
          label: 'Asset index',
          url: index.url,
          icon: ArrowDownload16Filled,
          download: true,
        },
      ],
    }
  },
}
