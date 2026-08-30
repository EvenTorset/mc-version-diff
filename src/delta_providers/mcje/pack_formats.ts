import type { ParsedZIP } from '@/util/zip'

export interface PackFormats {
  resource: string | null
  data: string | null
}

const formats = new Map<string, PackFormats>()

function fromPackVersion(value: any): PackFormats | null {
  if (typeof value === 'number') {
    const both = String(value)
    return { resource: both, data: both }
  }
  if (!value || typeof value !== 'object') return null

  if (typeof value.resource_major === 'number' && typeof value.data_major === 'number') {
    return {
      resource: `${value.resource_major}.${value.resource_minor ?? 0}`,
      data: `${value.data_major}.${value.data_minor ?? 0}`,
    }
  }
  if (typeof value.resource === 'number' && typeof value.data === 'number') {
    return { resource: String(value.resource), data: String(value.data) }
  }
  return null
}

async function readJson(archive: ParsedZIP, path: string): Promise<any | null> {
  const entry = archive.files[path]
  if (!entry) return null
  try {
    return JSON.parse(await entry.textContent)
  } catch {
    return null
  }
}

export function getPackFormats(id: string): PackFormats | null {
  return formats.get(id) ?? null
}

export async function readPackFormats(id: string, archive: ParsedZIP): Promise<void> {
  if (formats.has(id)) return

  const version = await readJson(archive, 'version.json')
  const fromVersion = version ? fromPackVersion(version.pack_version) : null
  if (fromVersion) {
    formats.set(id, fromVersion)
    return
  }

  const packFormat = (await readJson(archive, 'pack.mcmeta'))?.pack?.pack_format
  if (typeof packFormat === 'number') {
    const both = String(packFormat)
    formats.set(id, { resource: both, data: both })
  }
}
