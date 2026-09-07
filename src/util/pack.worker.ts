import { assemble, storedEntry, type StoredEntry } from './zip'
import { naturalCompare } from './sort'

export interface PackWorkerFile {
  path: string
  file: File
}

export type PackWorkerInput =
  | { type: 'files', files: PackWorkerFile[] }
  | { type: 'pack' }

export type PackWorkerMessage =
  | { type: 'progress', done: number, total: number }
  | { type: 'result', bytes: Uint8Array<ArrayBuffer> }

const BATCH = 256

const received: PackWorkerFile[] = []

self.onmessage = async (event: MessageEvent<PackWorkerInput>) => {
  if (event.data.type === 'files') {
    received.push(...event.data.files)
    return
  }
  const files = received.sort((a, b) => naturalCompare(a.path, b.path))
  const entries: StoredEntry[] = []
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH)
    const buffers = await Promise.all(batch.map(f => f.file.arrayBuffer()))
    for (let j = 0; j < batch.length; j++) {
      entries.push(storedEntry(batch[j].path, new Uint8Array(buffers[j])))
    }
    postMessage({ type: 'progress', done: entries.length, total: files.length } satisfies PackWorkerMessage)
  }
  const bytes = assemble(entries)
  postMessage({ type: 'result', bytes } satisfies PackWorkerMessage, { transfer: [bytes.buffer] })
}
