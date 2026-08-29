import init, { compare_batch } from './wasm/cmp_wasm'
import wasmUrl from './wasm/cmp_wasm_bg.wasm?url'

self.addEventListener('unhandledrejection', e => console.error('unhandled rejection:', e.reason))

const ready = init({ module_or_path: wasmUrl })

const STRIDE = 8

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

self.onmessage = async (event: MessageEvent<WorkerComparePayload>) => {
  const { tasks, data } = event.data
  await ready

  const flat = new Uint32Array(tasks.length * STRIDE)
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    const o = i * STRIDE
    flat[o] = task.kind === 'png' ? 0 : 1
    flat[o + 1] = task.aOffset
    flat[o + 2] = task.aLength
    flat[o + 3] = task.aMethod
    flat[o + 4] = task.bOffset
    flat[o + 5] = task.bLength
    flat[o + 6] = task.bMethod
    flat[o + 7] = task.littleEndian ? 1 : 0
  }

  const same = compare_batch(new Uint8Array(data), flat)
  const results: WorkerCompareResult[] = tasks.map((task, i) => ({ id: task.id, same: same[i] === 1 }))

  self.postMessage({ type: 'results', results } as WorkerCompareMessage)
}
