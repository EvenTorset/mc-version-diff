export interface OggChunk {
  bytes: Uint8Array<ArrayBuffer>
  start: number
  end: number
  lead: boolean
}

export interface OggSplit {
  duration: number
  sampleRate: number
  chunks: OggChunk[]
}

const LEAD_IN = 0.5

interface OggPage {
  start: number
  size: number
  granule: number
}

function readPages(bytes: Uint8Array): OggPage[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const pages: OggPage[] = []
  let at = 0
  while (at + 27 <= bytes.length) {
    if (bytes[at] !== 0x4f || bytes[at + 1] !== 0x67 || bytes[at + 2] !== 0x67 || bytes[at + 3] !== 0x53) return null
    const segments = bytes[at + 26]
    if (at + 27 + segments > bytes.length) return null
    let body = 0
    for (let s = 0; s < segments; s++) body += bytes[at + 27 + s]
    const size = 27 + segments + body
    pages.push({ start: at, size, granule: Number(view.getBigInt64(at + 6, true)) })
    at += size
  }
  return at === bytes.length ? pages : null
}

function readSampleRate(bytes: Uint8Array, page: OggPage): number {
  const packet = page.start + 27 + bytes[page.start + 26]
  if (bytes[packet] !== 1) return 0
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return view.getUint32(packet + 12, true)
}

export function splitOgg(bytes: Uint8Array<ArrayBuffer>, chunkSeconds: number): OggSplit | null {
  const pages = readPages(bytes)
  if (!pages || pages.length < 3) return null

  const sampleRate = readSampleRate(bytes, pages[0])
  if (!sampleRate) return null

  let headerEnd = 0
  while (headerEnd < pages.length && pages[headerEnd].granule <= 0) headerEnd++
  if (headerEnd === 0 || headerEnd === pages.length) return null

  const header = bytes.subarray(0, pages[headerEnd].start)
  const audio = pages.slice(headerEnd)
  const duration = audio[audio.length - 1].granule / sampleRate

  const chunks: OggChunk[] = []
  let from = 0
  let start = 0
  for (let i = 0; i < audio.length; i++) {
    const end = audio[i].granule / sampleRate
    const last = i === audio.length - 1
    if (!last && end - start < chunkSeconds) continue

    let lead = from
    while (lead > 0 && audio[lead - 1].granule / sampleRate > start - LEAD_IN) lead--

    const first = audio[lead]
    const final = audio[i]
    const body = bytes.subarray(first.start, final.start + final.size)
    const chunk = new Uint8Array(header.length + body.length)
    chunk.set(header, 0)
    chunk.set(body, header.length)
    chunks.push({ bytes: chunk, start, end, lead: lead < from })
    from = i + 1
    start = end
  }

  return { duration, sampleRate, chunks }
}

export interface OggStream {
  description: Uint8Array<ArrayBuffer>
  packets: Uint8Array<ArrayBuffer>[]
  channels: number
  sampleRate: number
  frames: number
}

function lacing(length: number): number[] {
  const out: number[] = []
  while (length >= 255) {
    out.push(255)
    length -= 255
  }
  out.push(length)
  return out
}

export function readStream(bytes: Uint8Array<ArrayBuffer>): OggStream | null {
  const pages = readPages(bytes)
  if (!pages || pages.length < 3) return null

  const packets: Uint8Array<ArrayBuffer>[] = []
  let pending: Uint8Array[] = []
  let length = 0

  for (const page of pages) {
    const segments = bytes[page.start + 26]
    let at = page.start + 27 + segments
    for (let s = 0; s < segments; s++) {
      const size = bytes[page.start + 27 + s]
      pending.push(bytes.subarray(at, at + size))
      length += size
      at += size
      if (size === 255) continue
      const packet = new Uint8Array(length)
      let offset = 0
      for (const part of pending) {
        packet.set(part, offset)
        offset += part.length
      }
      packets.push(packet)
      pending = []
      length = 0
    }
  }

  if (packets.length < 4) return null
  const headers = packets.slice(0, 3)
  if (headers[0].length < 16 || headers[0][0] !== 1) return null

  const prefix = [2].concat(lacing(headers[0].length), lacing(headers[1].length))
  const description = new Uint8Array(prefix.length + headers.reduce((total, header) => total + header.length, 0))
  description.set(prefix, 0)
  let offset = prefix.length
  for (const header of headers) {
    description.set(header, offset)
    offset += header.length
  }

  const head = new DataView(headers[0].buffer, headers[0].byteOffset, headers[0].byteLength)
  const sampleRate = head.getUint32(12, true)
  const channels = headers[0][11]
  if (!sampleRate || !channels) return null

  return {
    description,
    packets: packets.slice(3),
    channels,
    sampleRate,
    frames: pages[pages.length - 1].granule,
  }
}
