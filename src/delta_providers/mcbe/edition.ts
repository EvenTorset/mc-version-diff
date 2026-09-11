import type { ManifestVersion, VersionDetails } from 'minecraft-asset-loader'
import { ArrowDownload16Filled, Open16Filled } from '@vicons/fluent'
import type { Edition } from '@/components/versions/edition'
import type { DeltaResult } from '@/delta_providers'
import { formatBytes } from '@/util/bytes'
import { assets } from '../loader'
import MCBEDescription from './MCBEDescription.vue'
import MCBEVersionTooltip from './MCBEVersionTooltip.vue'
import MCBEVersionFacts from './MCBEVersionFacts.vue'
import { knownZipSize, releaseAssets } from './util'

export type MCBEReleaseAsset = {
  name: string
  size: number
  browser_download_url: string
}

export type MCBEVersionDetails = VersionDetails & {
  html_url: string
  body?: string
  assets?: MCBEReleaseAsset[]
}

export type MCBEManifestVersion = ManifestVersion & {
  tag?: string
  zip?: { url: string, size: number | null, archive?: boolean }
}

function changelogUrl(details: VersionDetails): string | null {
  return /Release notes:\*\*\s*(https?:\/\/\S+)/.exec((details as MCBEVersionDetails).body ?? '')?.[1] ?? null
}

const TIPS = {
  size: 'Download size of the full samples zip, which holds the resource pack, behavior pack and documentation.',
}

const decoder = new TextDecoder()
const FLIPBOOKS = 'resource_pack/textures/flipbook_textures.json'

const flipbooks = new WeakMap<DeltaResult, Map<string, Promise<Map<string, string>>>>()

async function readFlipbooks(dr: DeltaResult, version: string) {
  const text = decoder.decode(await dr.getEntry(version, FLIPBOOKS))
  const animations = new Map<string, string>()
  for (const entry of JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''))) {
    if (typeof entry?.flipbook_texture !== 'string') continue
    const animation: Record<string, unknown> = {
      frametime: entry.ticks_per_frame ?? 1,
      interpolate: entry.blend_frames !== false,
    }
    if (Array.isArray(entry.frames)) animation.frames = entry.frames
    animations.set(`resource_pack/${entry.flipbook_texture}`, JSON.stringify({ animation }))
  }
  return animations
}

export const bedrockEdition: Edition = {
  id: 'mcbe',
  name: 'Bedrock Edition',
  description: MCBEDescription,
  typeName: type => type === 'snapshot' ? 'preview' : type,
  typeTip: 'Release versions are the finished updates. Previews are the test builds of the next one.',
  get assets() {
    return assets('bedrock')
  },
  lineSegments: 3,
  tooltip: MCBEVersionTooltip,
  summary: MCBEVersionFacts,
  async overview(version, details) {
    const size = await knownZipSize(version, details)
    const changelog = changelogUrl(details)
    return {
      facts: [ { label: 'Size', value: size === null ? 'unknown' : formatBytes(size), tip: TIPS.size } ],
      links: [
        ...(version as MCBEManifestVersion).zip ? [ {
          label: 'Samples zip',
          url: (version as MCBEManifestVersion).zip!.url,
          icon: ArrowDownload16Filled,
          download: true,
        } ] : [],
        {
          label: 'GitHub release',
          url: (details as MCBEVersionDetails).html_url,
          icon: Open16Filled,
          download: false,
        },
        ...changelog ? [ {
          label: 'Changelog',
          url: changelog,
          icon: Open16Filled,
          download: false,
        } ] : [],
      ],
    }
  },
  between(a, b) {
    const sizeA = releaseAssets(a).find(asset => asset.name.endsWith('-full.zip'))?.size
    const sizeB = releaseAssets(b).find(asset => asset.name.endsWith('-full.zip'))?.size
    if (sizeA === undefined || sizeB === undefined) return []
    const delta = sizeB - sizeA
    return [ delta === 0 ? 'same size' : `${delta > 0 ? '+' : '-'}${formatBytes(Math.abs(delta))}` ]
  },
  async animation(dr, version, path) {
    let versions = flipbooks.get(dr)
    if (!versions) flipbooks.set(dr, versions = new Map())
    let pending = versions.get(version)
    if (!pending) versions.set(version, pending = readFlipbooks(dr, version).catch(() => new Map()))
    return (await pending).get(path.replace(/\.[^./]+$/, '')) ?? null
  },
  equivalences: [
    {
      test: path => /\.(?:json|html)$/.test(path),
      kind: 'versionless',
    },
  ],
}
