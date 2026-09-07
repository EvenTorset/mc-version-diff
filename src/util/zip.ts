const encoder = new TextEncoder()

const crc32Table = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crc32Table[n] = c
}

export function crc32(bytes: Uint8Array): number {
  let crc = -1
  for (let i = 0; i < bytes.length; i++) {
    crc = crc32Table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ -1) >>> 0
}

export async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export interface StoredEntry {
  local: Uint8Array
  central: Uint8Array
}

export function storedEntry(path: string, bytes: Uint8Array): StoredEntry {
  const name = encoder.encode(path)
  const crc = crc32(bytes)

  const local = new Uint8Array(30 + name.length + bytes.length)
  const lv = new DataView(local.buffer)
  lv.setUint32(0, 0x04034b50, true)
  lv.setUint16(4, 20, true)
  lv.setUint32(14, crc, true)
  lv.setUint32(18, bytes.length, true)
  lv.setUint32(22, bytes.length, true)
  lv.setUint16(26, name.length, true)
  local.set(name, 30)
  local.set(bytes, 30 + name.length)

  const central = new Uint8Array(46 + name.length)
  const cv = new DataView(central.buffer)
  cv.setUint32(0, 0x02014b50, true)
  cv.setUint16(4, 20, true)
  cv.setUint16(6, 20, true)
  cv.setUint32(16, crc, true)
  cv.setUint32(20, bytes.length, true)
  cv.setUint32(24, bytes.length, true)
  cv.setUint16(28, name.length, true)
  central.set(name, 46)

  return { local, central }
}

export function assemble(entries: StoredEntry[]): Uint8Array<ArrayBuffer> {
  let offset = 0
  for (const { local, central } of entries) {
    new DataView(central.buffer).setUint32(42, offset, true)
    offset += local.length
  }
  const cdSize = entries.reduce((n, e) => n + e.central.length, 0)

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)

  const out = new Uint8Array(offset + cdSize + 22)
  let at = 0
  for (const part of [...entries.map(e => e.local), ...entries.map(e => e.central), eocd]) {
    out.set(part, at)
    at += part.length
  }
  return out
}
