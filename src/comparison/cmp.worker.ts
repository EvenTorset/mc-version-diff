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

export type BatchTask = {
  id: number
  kind: 'png' | 'nbt'
  littleEndian?: boolean
  aOffset: number
  aLength: number
  aMethod: number
  bOffset: number
  bLength: number
  bMethod: number
}

export type WorkerComparePayload = {
  tasks: BatchTask[]
  data: ArrayBuffer
}

export type WorkerCompareResult = {
  id: number
  same: boolean
  error?: string
}

export type WorkerCompareMessage = {
  type: 'results'
  results: WorkerCompareResult[]
}

async function decompressZipEntry(bytes: Uint8Array, compressionMethod: number): Promise<Uint8Array> {
  if (compressionMethod === 0) return bytes
  return new Uint8Array(await decompressBuffer(bytes as BufferSource))
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

async function runTask(task: BatchTask, data: Uint8Array): Promise<WorkerCompareResult> {
  try {
    const [rawA, rawB] = await Promise.all([
      decompressZipEntry(data.subarray(task.aOffset, task.aOffset + task.aLength), task.aMethod),
      decompressZipEntry(data.subarray(task.bOffset, task.bOffset + task.bLength), task.bMethod)
    ])

    let same = false

    if (task.kind === 'png') {
      same = await comparePngPixels(rawA, rawB)
    } else {
      const [nbtA, nbtB] = await Promise.all([
        decompressNBT(rawA),
        decompressNBT(rawB)
      ])

      const offsetA = findDataVersionOffset(nbtA, { littleEndian: task.littleEndian })
      if (offsetA !== -1) nbtA.fill(0, offsetA, offsetA + 4)

      const offsetB = findDataVersionOffset(nbtB, { littleEndian: task.littleEndian })
      if (offsetB !== -1) nbtB.fill(0, offsetB, offsetB + 4)

      same = bytesEqual(nbtA, nbtB)
    }

    return { id: task.id, same }
  } catch (err) {
    return { id: task.id, same: false, error: String(err) }
  }
}

self.onmessage = async (event: MessageEvent<WorkerComparePayload>) => {
  const { tasks, data } = event.data
  const bytes = new Uint8Array(data)
  const results = await Promise.all(tasks.map(task => runTask(task, bytes)))
  self.postMessage({ type: 'results', results } as WorkerCompareMessage)
}
