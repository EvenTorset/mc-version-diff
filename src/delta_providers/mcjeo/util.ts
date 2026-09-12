import type { ManifestVersion } from 'minecraft-asset-loader'
import type { AssetsManifestVersion } from './edition'
import { gameVersion, type GameVersion } from './estimate'

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
