import type { ManifestVersion } from 'minecraft-asset-loader'
import { assets } from '../loader'
import { findVersion } from '../manifest'
import type { AssetsManifestVersion } from './edition'

const jars = new Map<string, Promise<ManifestVersion | null>>()

function jarOf(index: string): Promise<ManifestVersion | null> {
  let pending = jars.get(index)
  if (!pending) jars.set(index, pending = resolve(index).catch(() => null))
  return pending
}

async function resolve(index: string): Promise<ManifestVersion | null> {
  const entry = await findVersion(assets('assets'), index) as AssetsManifestVersion | null
  return entry?.last ? findVersion(assets('java'), entry.last) : null
}

export async function readFromJar(index: string, path: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const version = await jarOf(index)
  if (!version) return null
  const entry = await version.file(path).catch(() => null)
  return entry ? await entry.read() as Uint8Array<ArrayBuffer> : null
}

export async function listFromJar(index: string, dir: string): Promise<string[]> {
  const version = await jarOf(index)
  if (!version) return []
  const listing = await version.list(dir, { folders: true }).catch(() => null)
  if (!listing) return []
  return listing.folders.map(folder => folder.path.slice(dir.length + 1))
    .concat(listing.files.map(file => file.path.slice(dir.length + 1)))
}
