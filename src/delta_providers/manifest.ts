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

export type SuggestionKey = 'featured' | 'latest' | 'since-release' | 'major' | 'patches'

export type SuggestionPair = [ManifestVersion, ManifestVersion]

export type DiffSuggestion = [label: string, pair: SuggestionPair]

function pair(a: ManifestVersion | null | undefined, b: ManifestVersion | null | undefined): SuggestionPair | null {
  return a && b && a !== b ? [ a, b ] : null
}

async function suggestionPairs(edition: Edition) {
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
    'latest': pair(all[1], all[0]),
    'since-release': pair(currentReleaseExceptLatest, newest),
    'major': pair(prevMajorRelease, currentRelease),
    'patches': pair(currentMajorRelease, currentRelease),
    latestIsRelease: newest?.type === 'release',
    sinceIsMajor: currentReleaseExceptLatest === prevMajorRelease,
  }
}

export async function getSuggestionPair(edition: Edition, key: SuggestionKey): Promise<SuggestionPair | null> {
  if (key === 'featured') {
    return (await getDiffSuggestions(edition))[0]?.[1] ?? null
  }

  return (await suggestionPairs(edition))[key]
}

export async function getDiffSuggestions(edition: Edition): Promise<DiffSuggestion[]> {
  const pairs = await suggestionPairs(edition)

  const ordered: [string, SuggestionPair | null][] = pairs.latestIsRelease
    ? [
      [ 'Major release', pairs.major ],
      [ 'Release patches', pairs.patches ],
      [ 'Latest version', pairs.latest ],
    ]
    : [
      [ 'Latest version', pairs.latest ],
      [ 'Since release', pairs.sinceIsMajor ? null : pairs['since-release'] ],
      [ 'Major release', pairs.major ],
      [ 'Release patches', pairs.patches ],
    ]

  const shown: DiffSuggestion[] = []
  for (const [ label, suggestion ] of ordered) {
    if (!suggestion) continue
    if (shown.some(([ , seen ]) => seen[0].id === suggestion[0].id && seen[1].id === suggestion[1].id)) continue
    shown.push([ label, suggestion ])
  }

  return shown
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
