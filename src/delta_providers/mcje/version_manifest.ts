import { ref } from 'vue'
import { download } from '@/util/download'
import { ProgressHandler } from '@/util/progress'
import { clearDirectory, getDirectory } from '@/util/opfs'

const mcjeManifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const manifestCacheFile = 'mcje_version_manifest.json'

export type MCJEManifestVersion = {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
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
    server?: MCJEVersionDownloads
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

// 13w24a, the 1.6 snapshot that moved the game's files into assets/. Older
// versions are texture packs, with the files at the root of the JAR instead
const legacyAssetsDate = new Date('2013-06-13T15:32:23+00:00')

export function usesLegacyAssets(releaseTime: string) {
  return new Date(releaseTime) < legacyAssetsDate
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

let refreshPromise: Promise<void> | null = null

function refreshManifest(progHandler?: ProgressHandler): Promise<void> {
  return refreshPromise = download(mcjeManifestUrl, progHandler).then(async res => {
    applyManifest(await res.json())
    writeCachedJson(manifestCacheFile, mcjeManifest)
  })
}

function applyManifest(manifest: MCJEManifest) {
  mcjeManifest = manifest
  mcjeVersions.value = manifest.versions.map(ver => ver.id)
}

function detailsCacheName(url: string): string | null {
  const hash = url.match(/\/packages\/([0-9a-f]{8,})\//)?.[1]
  return hash ? `details_${hash}.json` : null
}

async function readCachedJson<T>(name: string): Promise<T | null> {
  try {
    const dir = await getDirectory('meta')
    const handle = await dir.getFileHandle(name)
    return JSON.parse(await (await handle.getFile()).text())
  } catch {
    return null
  }
}

async function writeCachedJson(name: string, value: unknown): Promise<void> {
  try {
    const dir = await getDirectory('meta')
    const handle = await dir.getFileHandle(name, { create: true })
    const writable = await handle.createWritable()
    await writable.write(JSON.stringify(value))
    await writable.close()
  } catch {
  }
}

export function loadMCJEManifest(progHandler?: ProgressHandler) {
  if (mcjeManifest !== null) {
    progHandler?.update(1, 1, 1)
    return;
  }
  if (progHandler) progHandlers.push(progHandler)
  if (downloadPromise !== null) {
    return downloadPromise
  }
  downloadPromise = (async () => {
    refreshManifest(allProgHandlers)
    const cached = await readCachedJson<MCJEManifest>(manifestCacheFile)
    if (cached && mcjeManifest === null) {
      applyManifest(cached)
      refreshPromise!.catch(() => {})
    } else {
      await refreshPromise
    }
  })()
  return downloadPromise
}

async function findVersion(id: string): Promise<MCJEManifestVersion | null> {
  await loadMCJEManifest()
  const lookup = () => mcjeManifest?.versions.find(v => v.id === id) ?? null

  let version = lookup()
  if (version) return version

  if (refreshPromise) {
    const failed = await refreshPromise.then(() => false, () => true)
    version = lookup()
    if (version || !failed) return version
  }

  await refreshManifest().catch(() => {})
  return lookup()
}

export function clearMetaCache(): Promise<void> {
  return clearDirectory('meta')
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
    const ver = await findVersion(version)
    if (ver) {
      version = ver
    } else {
      throw new Error('Failed to find version details')
    }
  }
  if (version.url in detailsCache) {
    return detailsCache[version.url]
  }

  const cacheName = detailsCacheName(version.url)
  if (cacheName) {
    const cached = await readCachedJson<MCJEVersionDetails>(cacheName)
    if (cached) return detailsCache[version.url] = cached
  }

  const details: MCJEVersionDetails = await download(version.url, progHandler).then(e => e.json())
  if (cacheName) writeCachedJson(cacheName, details)
  return detailsCache[version.url] = details
}

export async function getVersion(id: string): Promise<MCJEManifestVersion | null> {
  return findVersion(id)
}

const MAIN_EXTRA = new Set([
  '1.20.4', '1.20.6',
  '1.21.3', '1.21.4', '1.21.5', '1.21.8', '1.21.10', '1.21.11',
])

export function getReleaseVersions(): MCJEManifestVersion[] {
  return getVersionList().filter(v => v.type === 'release')
}

export function getMainVersions(): MCJEManifestVersion[] {
  const all = getVersionList()
  const releases = all.filter(v => v.type === 'release')
  const lines = new Set<string>()
  const picked: MCJEManifestVersion[] = []

  for (const release of releases) {
    const line = release.id.split('.').slice(0, 2).join('.')
    const latestOfLine = !lines.has(line)
    lines.add(line)
    if (latestOfLine || MAIN_EXTRA.has(release.id)) picked.push(release)
  }

  const snapshot = all.find(v => v.type === 'snapshot')
  if (snapshot && (!releases[0] || snapshot.releaseTime > releases[0].releaseTime)) {
    picked.unshift(snapshot)
  }

  return picked
}

export interface AdjacentDelta {
  a: string
  b: string
}

export interface NearbyDeltaGroup {
  label: string
  prev: AdjacentDelta | null
  next: AdjacentDelta | null
}

function surroundingIn(versions: MCJEManifestVersion[], a: string, b: string) {
  const ai = versions.findIndex(v => v.id === a)
  const bi = versions.findIndex(v => v.id === b)
  if (ai === -1 || bi === -1 || bi !== ai - 1) {
    return { prev: null, next: null }
  }
  return {
    prev: ai < versions.length - 1 ? { a: versions[ai + 1].id, b: a } : null,
    next: bi > 0 ? { a: b, b: versions[bi - 1].id } : null,
  }
}

function samePair(x: AdjacentDelta | null, y: AdjacentDelta | null) {
  if (!x || !y) return x === y
  return x.a === y.a && x.b === y.b
}

export async function getSurroundingDeltas(a: string, b: string) {
  await loadMCJEManifest()
  return surroundingIn(getVersionList(), a, b)
}

export async function getNearbyDeltas(a: string, b: string): Promise<NearbyDeltaGroup[]> {
  await loadMCJEManifest()

  const groups: NearbyDeltaGroup[] = []

  for (const [ label, versions ] of [
    [ '', getVersionList() ],
    [ 'release', getReleaseVersions() ],
    [ 'main release', getMainVersions() ],
  ] as const) {
    const { prev, next } = surroundingIn(versions, a, b)
    if (!prev && !next) continue
    if (groups.some(g => samePair(g.prev, prev) && samePair(g.next, next))) continue
    groups.push({ label, prev, next })
  }

  return groups
}
