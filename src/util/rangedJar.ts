import type { ProgressHandler } from '@/util/progress'

const PROBE = 65536
const MERGE_GAP = 65536
const CONCURRENCY = 6

const MIN_SIZE = 4 * 1024 * 1024

interface Range {
  from: number
  to: number
}

async function fetchRange(url: string, from: number, to: number): Promise<Uint8Array | null> {
  const response = await fetch(url, { headers: { Range: `bytes=${from}-${to}` } })
  if (response.status !== 206) return null
  return new Uint8Array(await response.arrayBuffer())
}

function findEOCD(bytes: Uint8Array): number {
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      return i
    }
  }
  return -1
}

function wantedRanges(
  centralDir: Uint8Array,
  count: number,
  keep: (path: string) => boolean,
): Range[] {
  const view = new DataView(centralDir.buffer, centralDir.byteOffset, centralDir.byteLength)
  const decoder = new TextDecoder()
  const wanted: Range[] = []
  let o = 0

  for (let i = 0; i < count && o + 46 <= centralDir.length; i++) {
    const n = view.getUint16(o + 28, true)
    const m = view.getUint16(o + 30, true)
    const k = view.getUint16(o + 32, true)
    const path = decoder.decode(centralDir.subarray(o + 46, o + 46 + n))
    if (!path.endsWith('/') && keep(path)) {
      const compressedSize = view.getUint32(o + 20, true)
      const headerOffset = view.getUint32(o + 42, true)
      wanted.push({ from: headerOffset, to: headerOffset + 30 + n + compressedSize + 4096 })
    }
    o += 46 + n + m + k
  }

  wanted.sort((a, b) => a.from - b.from)
  const merged: Range[] = []
  for (const range of wanted) {
    const last = merged[merged.length - 1]
    if (last && range.from - last.to <= MERGE_GAP) last.to = Math.max(last.to, range.to)
    else merged.push({ ...range })
  }
  return merged
}

export async function fetchJarWithout(
  url: string,
  size: number,
  keep: (path: string) => boolean,
  progHandler?: ProgressHandler,
): Promise<ArrayBuffer | null> {
  if (size < MIN_SIZE) return null

  try {
    progHandler?.setUnit('byte')
    progHandler?.update(0, 0, size)

    const probeStart = Math.max(0, size - PROBE)
    const probe = await fetchRange(url, probeStart, size - 1)
    if (!probe) return null

    const eocd = findEOCD(probe)
    if (eocd === -1) return null
    const probeView = new DataView(probe.buffer, probe.byteOffset, probe.byteLength)
    const dirOffset = probeView.getUint32(eocd + 16, true)
    const dirSize = probeView.getUint32(eocd + 12, true)
    const count = probeView.getUint16(eocd + 10, true)
    if (dirOffset + dirSize > size) return null

    let centralDir: Uint8Array
    if (dirOffset >= probeStart) {
      centralDir = probe.subarray(dirOffset - probeStart, dirOffset - probeStart + dirSize)
    } else {
      const fetched = await fetchRange(url, dirOffset, dirOffset + dirSize - 1)
      if (!fetched) return null
      centralDir = fetched
    }

    const ranges = wantedRanges(centralDir, count, keep)
    const total = ranges.reduce((sum, r) => sum + Math.min(r.to, size) - r.from, 0) + probe.length + centralDir.length
    if (total >= size) return null

    const buffer = new ArrayBuffer(size)
    const out = new Uint8Array(buffer)
    out.set(probe, probeStart)
    if (dirOffset < probeStart) out.set(centralDir, dirOffset)

    let done = probe.length + centralDir.length
    progHandler?.update(done / total, done, total)

    for (let i = 0; i < ranges.length; i += CONCURRENCY) {
      const batch = ranges.slice(i, i + CONCURRENCY)
      const parts = await Promise.all(batch.map(r => fetchRange(url, r.from, Math.min(r.to, size - 1))))
      for (let k = 0; k < parts.length; k++) {
        const part = parts[k]
        if (!part) return null
        out.set(part, batch[k].from)
        done += part.length
        progHandler?.update(Math.min(1, done / total), done, total)
      }
    }

    progHandler?.update(1, total, total)
    return buffer
  } catch {
    return null
  }
}
