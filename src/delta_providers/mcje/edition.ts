import type { ManifestVersion, VersionDetails } from 'minecraft-asset-loader'
import { ArrowDownload16Filled, Open16Filled } from '@vicons/fluent'
import type { Edition } from '@/components/versions/edition'
import { formatBytes } from '@/util/bytes'
import { assets } from '../assets'
import { getMcjeChangelogUrl } from './changelog'
import { getPackFormats, readPackFormats } from './pack_formats'
import MCJEVersionTooltip from './MCJEVersionTooltip.vue'
import MCJEVersionFacts from './MCJEVersionFacts.vue'

export type MCJEVersionDownloads = {
  sha1: string
  size: number
  url: string
}

export type MCJEVersionDetails = VersionDetails & {
  assetIndex: {
    id: string
    sha1: string
    size: number
    totalSize: number
    url: string
  }
  assets: string
  downloads: {
    client: MCJEVersionDownloads
    server?: MCJEVersionDownloads
  }
  releaseTime: string
  time: string
  type: string
}

const TIPS = {
  size: 'Download size of the client jar, which holds the code, textures, models and data.',
  assets: 'Combined size of the sounds and language files, which live outside the jar and are downloaded separately.',
  assetIndex: 'Names the list of external assets this version uses. Versions sharing an index share those files.',
  resource: 'The resource pack format this version accepts. A pack made for a different number needs updating.',
  data: 'The data pack format this version accepts. A pack made for a different number needs updating.',
}

export const javaEdition: Edition = {
  id: 'mcje',
  name: 'Java Edition',
  get assets() {
    return assets()
  },
  lineSegments: 2,
  tooltip: MCJEVersionTooltip,
  summary: MCJEVersionFacts,
  async overview(version: ManifestVersion, details: VersionDetails) {
    const java = details as MCJEVersionDetails
    const packs = getPackFormats(version.id)
    const changelog = await getMcjeChangelogUrl(version.id)
    return {
      facts: [
        { label: 'Size', value: formatBytes(java.downloads.client.size), tip: TIPS.size },
        { label: 'Assets', value: formatBytes(java.assetIndex.totalSize), tip: TIPS.assets },
        { label: 'Asset index', value: java.assetIndex.id, tip: TIPS.assetIndex },
        ...packs?.resource ? [ { label: 'Resource pack format', value: packs.resource, tip: TIPS.resource } ] : [],
        ...packs?.data ? [ { label: 'Data pack format', value: packs.data, tip: TIPS.data } ] : [],
      ],
      links: [
        {
          label: 'Client jar',
          url: java.downloads.client.url,
          icon: ArrowDownload16Filled,
          download: true,
        },
        ...java.downloads.server ? [ {
          label: 'Server jar',
          url: java.downloads.server.url,
          icon: ArrowDownload16Filled,
          download: true,
        } ] : [],
        ...changelog ? [ {
          label: 'Blog post',
          url: changelog,
          icon: Open16Filled,
          download: false,
        } ] : [],
      ],
    }
  },
  between(a: VersionDetails, b: VersionDetails) {
    const delta = (b as MCJEVersionDetails).downloads.client.size - (a as MCJEVersionDetails).downloads.client.size
    return [ delta === 0 ? 'same size' : `${delta > 0 ? '+' : '-'}${formatBytes(Math.abs(delta))}` ]
  },
  afterLoad(content) {
    return readPackFormats(content.id, content.entries)
  },
}
