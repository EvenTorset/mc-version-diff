import { VersionType, type ManifestVersion, type VersionDetails } from 'minecraft-asset-loader'
import type { ProgressHandler } from '@/util/progress'
import type { VersionPair } from '@/types'
import { assets } from './assets'

export type MCJEManifestVersion = ManifestVersion

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

let versions: MCJEManifestVersion[] | null = null
let loading: Promise<void> | null = null

export function loadMCJEManifest(progHandler?: ProgressHandler): Promise<void> {
  if (versions) {
    progHandler?.update(1, 1, 1)
    return Promise.resolve()
  }
  progHandler?.update(0, 0, 0)
  loading ??= assets().manifest.versions().then(list => {
    versions = list
  }).finally(() => {
    loading = null
  })
  return loading.then(() => progHandler?.update(1, 1, 1))
}

export function getVersionList(): MCJEManifestVersion[] {
  if (!versions) throw new Error('MCJE manifest not loaded before getting version list')
  return versions
}

export function getReleaseVersions(): MCJEManifestVersion[] {
  return getVersionList().filter(v => v.type === 'release')
}

export function getMainVersions(): MCJEManifestVersion[] {
  return VersionType.MAIN(getVersionList())
}

export async function getVersion(id: string): Promise<MCJEManifestVersion | null> {
  await loadMCJEManifest()
  const manifest = assets().manifest
  const found = await manifest.version(id)
  if (found) return found
  await manifest.update().catch(() => {})
  versions = await manifest.versions()
  return manifest.version(id)
}

export async function getVersionDetails(version: MCJEManifestVersion | string, progHandler?: ProgressHandler): Promise<MCJEVersionDetails> {
  progHandler?.update(0, 0, 0)
  const entry = typeof version === 'string' ? await getVersion(version) : version
  if (!entry) throw new Error(`Unknown version "${version}"`)
  const details = await entry.details() as MCJEVersionDetails
  progHandler?.update(1, 1, 1)
  return details
}

export function getDiffSuggestions(): {
    latestVersion: [MCJEManifestVersion, MCJEManifestVersion]
    sinceRelease: [MCJEManifestVersion, MCJEManifestVersion] | null
    majorRelease: [MCJEManifestVersion, MCJEManifestVersion] | null
    releasePatches: [MCJEManifestVersion, MCJEManifestVersion] | null
} {
  const all = getVersionList()

  const currentRelease = all.find(e => e.type === 'release') ?? null
  const currentReleaseExceptLatest = all.slice(1).find(e => e.type === 'release') ?? null

  const currentMajorNum = currentRelease?.id.split('.').slice(0, 2).join('.') ?? null
  const currentMajorRelease = all.find(e => e.type === 'release' && e.id === currentMajorNum) ?? null
  const prevMajorRelease = currentMajorNum
    ? all.slice(1).find(e => e.type === 'release' && !e.id.startsWith(currentMajorNum)) ?? null
    : null

  return {
    latestVersion: [all[1], all[0]],
    sinceRelease: currentReleaseExceptLatest && all[0].type !== 'release' && currentReleaseExceptLatest !== prevMajorRelease
      ? [currentReleaseExceptLatest, all[0]]
      : null,
    majorRelease: prevMajorRelease && currentRelease
      ? [prevMajorRelease, currentRelease]
      : null,
    releasePatches: currentMajorRelease !== currentRelease && currentMajorRelease && currentRelease
      ? [currentMajorRelease, currentRelease]
      : null,
  }
}

export interface RelatedDeltaGroup {
  label: string
  prev: VersionPair | null
  next: VersionPair | null
}

export interface RelatedDeltaLink extends VersionPair {
  label: string
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

function samePair(x: VersionPair | null, y: VersionPair | null) {
  if (!x || !y) return x === y
  return x.a === y.a && x.b === y.b
}

export async function getSurroundingDeltas(a: string, b: string) {
  await loadMCJEManifest()
  return surroundingIn(getVersionList(), a, b)
}

function cycleRelease(versions: MCJEManifestVersion[], id: string) {
  const i = versions.findIndex(v => v.id === id)
  if (i === -1 || versions[i].type !== 'snapshot') return null
  for (let j = i + 1; j < versions.length; j++) {
    if (versions[j].type === 'release') return versions[j]
  }
  return null
}

export async function getRelatedDeltas(a: string, b: string): Promise<{
  groups: RelatedDeltaGroup[]
  links: RelatedDeltaLink[]
}> {
  await loadMCJEManifest()

  const all = getVersionList()
  const groups: RelatedDeltaGroup[] = []

  for (const [ label, versions ] of [
    [ 'version', all ],
    [ 'release', getReleaseVersions() ],
    [ 'main release', getMainVersions() ],
  ] as const) {
    const found = surroundingIn(versions, a, b)
    const prev = groups.some(g => samePair(g.prev, found.prev)) ? null : found.prev
    const next = groups.some(g => samePair(g.next, found.next)) ? null : found.next
    if (!prev && !next) continue
    groups.push({ label, prev, next })
  }

  const links: RelatedDeltaLink[] = []
  const release = cycleRelease(all, a)
  if (release && release.id === cycleRelease(all, b)?.id) {
    links.push({ label: 'Since the last release', a: release.id, b })
  }

  return { groups, links }
}
