import type { ManifestVersion } from 'minecraft-asset-loader'
import { ArrowDownload16Filled } from '@vicons/fluent'
import type { Edition } from '@/components/versions/edition'
import { formatBytes } from '@/util/bytes'
import { assets } from '../loader'
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
  versions: 'The game versions that use this asset index.',
  type: 'Release indexes are used by a finished update. Snapshot indexes are only used by the weekly previews.',
}

export const javaAssetsEdition: Edition = {
  id: 'assets',
  family: 'mcje',
  name: 'Java Assets',
  typeTip: TIPS.type,
  get assets() {
    return assets('assets')
  },
  lineSegments: 1,
  lazy: true,
  tooltip: AssetsVersionTooltip,
  summary: AssetsVersionFacts,
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
