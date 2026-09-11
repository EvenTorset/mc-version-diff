import type { ManifestVersion } from 'minecraft-asset-loader'
import { ArrowDownload16Filled } from '@vicons/fluent'
import type { Edition } from '@/components/versions/edition'
import { formatBytes } from '@/util/bytes'
import { assets } from '../loader'
import { expandSubpacks } from '../versions'
import { listFromJar, readFromJar } from './jar'
import AssetsVersionTooltip from './AssetsVersionTooltip.vue'
import AssetsVersionFacts from './AssetsVersionFacts.vue'

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

const TIPS = {
  size: 'Combined size of every object this index points at.',
  index: 'The name Mojang gives this asset index. Versions sharing it share their assets.',
  type: 'Release indexes are used by a finished update. Snapshot indexes are only used by the weekly previews.',
}

export const javaAssetsEdition: Edition = {
  id: 'assets',
  family: 'mcje',
  name: 'Java Assets',
  label: assetsRange,
  typeTip: TIPS.type,
  get assets() {
    return assets('assets')
  },
  lineSegments: 1,
  lazy: true,
  expand: expandSubpacks,
  fallback: {
    read: readFromJar,
    list: listFromJar,
  },
  tooltip: AssetsVersionTooltip,
  summary: AssetsVersionFacts,
  async overview(version) {
    const index = assetIndex(version)
    return {
      facts: [
        { label: 'Size', value: formatBytes(index.totalSize), tip: TIPS.size },
        { label: 'Index', value: index.id, tip: TIPS.index },
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
