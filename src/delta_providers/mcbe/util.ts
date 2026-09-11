import type { ManifestVersion, VersionDetails } from 'minecraft-asset-loader'
import type { MCBEManifestVersion, MCBEReleaseAsset, MCBEVersionDetails } from './edition'
import { assets } from '../assets'

export function releaseAssets(details: VersionDetails | null): MCBEReleaseAsset[] {
  return (details as MCBEVersionDetails | null)?.assets ?? []
}

export function zipSize(version: ManifestVersion, details: VersionDetails | null): number | null {
  return (version as MCBEManifestVersion).zip?.size
    ?? releaseAssets(details).find(asset => asset.name.endsWith('-full.zip'))?.size
    ?? null
}

export async function knownZipSize(version: ManifestVersion, details: VersionDetails | null): Promise<number | null> {
  const known = zipSize(version, details)
  if (known !== null) return known
  const key = `blobs/bedrock_${(version as MCBEManifestVersion).tag ?? version.id}`
  const cached = await assets('bedrock').listCache()
  return cached?.find(file => file.key === key)?.size ?? null
}

export function archiveUrl(version: ManifestVersion): string | null {
  const zip = (version as MCBEManifestVersion).zip
  return zip?.archive ? zip.url : null
}
