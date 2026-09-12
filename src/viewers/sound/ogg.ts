export interface OggChunk {
  bytes: Uint8Array<ArrayBuffer>
  start: number
  end: number
}

export interface OggSplit {
  duration: number
  sampleRate: number
  chunks: OggChunk[]
}

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

    const first = audio[from]
    const final = audio[i]
    const body = bytes.subarray(first.start, final.start + final.size)
    const chunk = new Uint8Array(header.length + body.length)
    chunk.set(header, 0)
    chunk.set(body, header.length)
    chunks.push({ bytes: chunk, start, end })
    from = i + 1
    start = end
  }

  return { duration, sampleRate, chunks }
}
