export interface PackFormats {
  resource: string | null
  data: string | null
}

type Readable = { read(): Promise<Uint8Array> }

const formats = new Map<string, PackFormats>()
const decoder = new TextDecoder()

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

async function readJson(entries: Map<string, Readable>, path: string): Promise<any | null> {
  const entry = entries.get(path)
  if (!entry) return null
  try {
    return JSON.parse(decoder.decode(await entry.read()))
  } catch {
    return null
  }
}

export function getPackFormats(id: string): PackFormats | null {
  return formats.get(id) ?? null
}

export async function readPackFormats(id: string, entries: Map<string, Readable>): Promise<void> {
  if (formats.has(id)) return

  const version = await readJson(entries, 'version.json')
  const fromVersion = version ? fromPackVersion(version.pack_version) : null
  if (fromVersion) {
    formats.set(id, fromVersion)
    return
  }

  const packFormat = (await readJson(entries, 'pack.mcmeta'))?.pack?.pack_format
  if (typeof packFormat === 'number') {
    const both = String(packFormat)
    formats.set(id, { resource: both, data: both })
  }
}
