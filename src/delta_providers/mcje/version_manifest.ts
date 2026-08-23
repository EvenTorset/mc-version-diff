import { ref } from 'vue'
import { download } from '@/util/download'
import { ProgressHandler } from '@/util/progress'

const mcjeManifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

export type MCJEManifestVersion = {
  id: string
  type: 'release' | 'snapshot'
  url: string
  time: string
  releaseTime: string
}
export type MCJEManifest = {
  /** Unreliable. Don't use this. */
  latest: {
    release: string
    snapshot: string
  }
  versions: MCJEManifestVersion[]
}
export type MCJEVersionDownloads = {
  sha1: string
  size: number
  url: string
}
export type MCJEVersionDetails = {
  arguments: {
    'default-user-jvm': any[]
    game: any[]
    jvm: any[]
  }
  assetIndex: {
    id: string
    sha1: string
    size: number
    totalSize: number
    url: string
  }
  assets: string
  complianceLevel: number
  downloads: {
    client: MCJEVersionDownloads
    server: MCJEVersionDownloads
  }
  id: string
  javaVersion: {
    component: string
    majorVersion: number
  }
  libraries: any[]
  logging: any
  mainClass: string
  minimumLauncherVersion: number
  releaseTime: string
  time: string
  type: string
}

// Pre-1.6 versions are not supported
const oldestSupportedVersionDate = new Date('2013-06-28T14:48:41+00:00')

// Mojang lists these as snapshots in the manifest, but their IDs are releases
const versionTypeFixes: Record<string, MCJEManifestVersion['type']> = {
  '1.3': 'release',
  '1.4': 'release',
  '1.4.1': 'release',
  '1.4.3': 'release',
  '1.5': 'release',
  '1.6': 'release',
  '1.6.3': 'release',
  '1.7': 'release',
  '1.7.1': 'release',
}

let downloadPromise: Promise<void> | null = null
let mcjeManifest: MCJEManifest | null = null
const detailsCache: Record<string, MCJEVersionDetails> = {}

export const mcjeVersions = ref<string[]>([])

let progHandlers: ProgressHandler[] = []
const allProgHandlers = new ProgressHandler(p => {
  for (const progHandler of progHandlers) {
    progHandler.update(p.ratio, p.current, p.total)
  }
})

export function loadMCJEManifest(progHandler?: ProgressHandler) {
  if (mcjeManifest !== null) {
    progHandler?.update(1, 1, 1)
    return;
  }
  if (progHandler) progHandlers.push(progHandler)
  if (downloadPromise !== null) {
    return downloadPromise
  }
  downloadPromise = download(mcjeManifestUrl, allProgHandlers).then(async res => {
    mcjeManifest = await res.json()
    mcjeManifest!.versions = mcjeManifest!.versions.filter(ver => oldestSupportedVersionDate <= new Date(ver.releaseTime))
    for (const ver of mcjeManifest!.versions) {
      const type = versionTypeFixes[ver.id]
      if (type) ver.type = type
    }
    mcjeVersions.value = mcjeManifest!.versions.map(ver => ver.id)
  })
  return downloadPromise
}

export function getVersionList() {
  if (mcjeManifest === null) {
    throw new Error('MCJE manifest not loaded before getting version list')
  }
  return mcjeManifest.versions
}

export function getDiffSuggestions(): {
    latestVersion: [MCJEManifestVersion, MCJEManifestVersion]
    sinceRelease: [MCJEManifestVersion, MCJEManifestVersion] | null
    // latestRelease: [MCJEManifestVersion, MCJEManifestVersion] | null
    majorRelease: [MCJEManifestVersion, MCJEManifestVersion] | null
    releasePatches: [MCJEManifestVersion, MCJEManifestVersion] | null
} {
  if (mcjeManifest === null) {
    throw new Error('MCJE manifest not loaded before getting diff suggestions')
  }

  const currentRelease = mcjeManifest.versions.find(e => e.type === 'release') ?? null
  const currentReleaseExceptLatest = mcjeManifest.versions.slice(1).find(e => e.type === 'release') ?? null
  // const prevRelease = currentRelease
  //   ? mcjeManifest.versions.slice(1).find(e => e.type === 'release' && e.id !== currentRelease.id) ?? null
  //   : null

  const currentMajorNum = mcjeManifest.versions.find(e => e.type === 'release')?.id.split('.').slice(0, 2).join('.') ?? null
  const currentMajorRelease = mcjeManifest.versions.find(e => e.type === 'release' && e.id === currentMajorNum) ?? null
  const prevMajorRelease = currentMajorNum
    ? mcjeManifest.versions.slice(1).find(e => e.type === 'release' && !e.id.startsWith(currentMajorNum)) ?? null
    : null

  return {
    latestVersion: [mcjeManifest.versions[1], mcjeManifest.versions[0]],
    sinceRelease: currentReleaseExceptLatest && mcjeManifest.versions[0].type !== 'release' && currentReleaseExceptLatest !== prevMajorRelease
      ? [currentReleaseExceptLatest, mcjeManifest.versions[0]]
      : null,
    // latestRelease: prevRelease !== prevMajorRelease && prevRelease && currentRelease
    //   ? [prevRelease, currentRelease]
    //   : null,
    majorRelease: prevMajorRelease && currentRelease
      ? [prevMajorRelease, currentRelease]
      : null,
    releasePatches: currentMajorRelease !== currentRelease && currentMajorRelease && currentRelease
      ? [currentMajorRelease, currentRelease]
      : null,
  }
}

export async function getVersionDetails(version: MCJEManifestVersion | string, progHandler?: ProgressHandler): Promise<MCJEVersionDetails> {
  if (typeof version === 'string') {
    await loadMCJEManifest(progHandler)
    const ver = mcjeManifest?.versions.find(v => v.id === version)
    if (ver) {
      version = ver
    } else {
      throw new Error('Failed to find version details')
    }
  }
  if (version.url in detailsCache) {
    return detailsCache[version.url]
  }
  return detailsCache[version.url] = await download(version.url, progHandler).then(e => e.json())
}

export async function getVersion(id: string): Promise<MCJEManifestVersion | null> {
  await loadMCJEManifest()
  for (const v of mcjeManifest?.versions!) {
    if (v.id === id) return v
  }
  return null
}

export async function getSurroundingDeltas(
  a: string,
  b: string,
): Promise<{
  prev: { a: string; b: string } | null
  next: { a: string; b: string } | null
}> {
  await loadMCJEManifest()
  const versions = mcjeManifest?.versions ?? []
  const ai = versions.findIndex(v => v.id === a)
  const bi = versions.findIndex(v => v.id === b)
  if (ai === -1 || bi === -1 || bi !== ai - 1) {
    return { prev: null, next: null }
  }
  return {
    prev:
      ai < versions.length - 1
        ? {
            a: versions[ai + 1].id,
            b: a,
          }
        : null,
    next:
      bi > 0
        ? {
            a: b,
            b: versions[bi - 1].id,
          }
        : null,
  }
}
