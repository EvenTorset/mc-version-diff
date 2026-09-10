import { VersionType, type ManifestVersion } from 'minecraft-asset-loader'
import type MinecraftAssets from 'minecraft-asset-loader'
import type { VersionPair } from '@/types'
import type { Edition } from '@/components/versions/edition'
import { refreshManifest } from './loader'

export async function findVersion(assets: MinecraftAssets, id: string): Promise<ManifestVersion | null> {
  const found = await assets.manifest.version(id)
  if (found) return found
  await refreshManifest(assets).catch(() => {})
  return assets.manifest.version(id)
}

export async function getDiffSuggestions(edition: Edition): Promise<{
    latestVersion: [ManifestVersion, ManifestVersion]
    sinceRelease: [ManifestVersion, ManifestVersion] | null
    majorRelease: [ManifestVersion, ManifestVersion] | null
    releasePatches: [ManifestVersion, ManifestVersion] | null
}> {
  const manifest = edition.assets.manifest
  const all = await manifest.versions()
  const releases = await manifest.versions(VersionType.RELEASE)
  const { release: currentRelease, newest } = await manifest.latest()

  const currentReleaseExceptLatest = releases.find(e => e !== newest) ?? null

  const currentMajorNum = currentRelease?.id.split('.').slice(0, edition.lineSegments).join('.') ?? null
  const currentMajorRelease = releases.find(e => e.id === currentMajorNum) ?? null
  const prevMajorRelease = currentMajorNum
    ? releases.find(e => e !== newest && !e.id.startsWith(currentMajorNum)) ?? null
    : null

  return {
    latestVersion: [all[1], all[0]],
    sinceRelease: currentReleaseExceptLatest && newest && newest.type !== 'release' && currentReleaseExceptLatest !== prevMajorRelease
      ? [currentReleaseExceptLatest, newest]
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

function surroundingIn(versions: ManifestVersion[], a: string, b: string) {
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

export async function getSurroundingDeltas(edition: Edition, a: string, b: string) {
  return surroundingIn(await edition.assets.manifest.versions(), a, b)
}

function cycleRelease(all: ManifestVersion[], releases: ManifestVersion[], id: string) {
  const version = all.find(v => v.id === id)
  if (version?.type !== 'snapshot') return null
  return releases.find(r => Date.parse(r.releaseTime) < Date.parse(version.releaseTime)) ?? null
}

export async function getRelatedDeltas(edition: Edition, a: string, b: string): Promise<{
  groups: RelatedDeltaGroup[]
  links: RelatedDeltaLink[]
}> {
  const manifest = edition.assets.manifest
  const all = await manifest.versions()
  const releases = await manifest.versions(VersionType.RELEASE)
  const groups: RelatedDeltaGroup[] = []

  for (const [ label, versions ] of [
    [ 'version', all ],
    [ 'release', releases ],
    [ 'main release', await manifest.versions(VersionType.MAIN) ],
  ] as const) {
    const found = surroundingIn(versions, a, b)
    const prev = groups.some(g => samePair(g.prev, found.prev)) ? null : found.prev
    const next = groups.some(g => samePair(g.next, found.next)) ? null : found.next
    if (!prev && !next) continue
    groups.push({ label, prev, next })
  }

  const links: RelatedDeltaLink[] = []
  const release = cycleRelease(all, releases, a)
  if (release && release.id === cycleRelease(all, releases, b)?.id) {
    links.push({ label: 'Since the last release', a: release.id, b })
  }

  return { groups, links }
}
