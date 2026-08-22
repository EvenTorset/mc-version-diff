import { decompressBuffer } from '@/util/zip'
import { comparePngPixels } from '@cccode/png-pixel-cmp'
import { decompressNBT, findDataVersionOffset } from '@/util/nbt'

self.addEventListener('unhandledrejection', e => console.error('unhandled rejection:', e.reason))

export type CompareItem = {
  compressedContent: Uint8Array<ArrayBuffer>
  compressionMethod: number
}

export type CompareTask =
  | { kind: 'png'; a: CompareItem; b: CompareItem }
  | { kind: 'nbt'; a: CompareItem; b: CompareItem; littleEndian?: boolean }

export type WorkerComparePayload = { id: number } & CompareTask

export type WorkerCompareMessage = {
  id: number
  type: 'result'
  same: boolean
  error?: string
}

async function decompressZipEntry(entry: CompareItem): Promise<Uint8Array> {
  if (entry.compressionMethod === 0) {
    return entry.compressedContent
  }
  const buffer = await decompressBuffer(entry.compressedContent)
  return new Uint8Array(buffer)
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

self.onmessage = async (event: MessageEvent<WorkerComparePayload>) => {
  const payload = event.data
  const { id, kind, a, b } = payload

  try {
    const [rawA, rawB] = await Promise.all([
      decompressZipEntry(a),
      decompressZipEntry(b)
    ])

    let same = false

    if (kind === 'png') {
      same = await comparePngPixels(rawA, rawB)
    } else if (kind === 'nbt') {
      const [nbtA, nbtB] = await Promise.all([
        decompressNBT(rawA),
        decompressNBT(rawB)
      ])

      const offsetA = findDataVersionOffset(nbtA, { littleEndian: payload.littleEndian })
      if (offsetA !== -1) nbtA.fill(0, offsetA, offsetA + 4)

      const offsetB = findDataVersionOffset(nbtB, { littleEndian: payload.littleEndian })
      if (offsetB !== -1) nbtB.fill(0, offsetB, offsetB + 4)

      same = bytesEqual(nbtA, nbtB)
    }

    self.postMessage({ id, type: 'result', same } as WorkerCompareMessage)
  } catch (err) {
    self.postMessage({
      id,
      type: 'result',
      same: false,
      error: String(err)
    } as WorkerCompareMessage)
  }
}
