import { writeZip } from 'minecraft-asset-loader'
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

const received: PackWorkerFile[] = []

self.onmessage = async (event: MessageEvent<PackWorkerInput>) => {
  if (event.data.type === 'files') {
    received.push(...event.data.files)
    return
  }
  const files = received.sort((a, b) => naturalCompare(a.path, b.path))
  let lastPercent = -1
  const bytes = await writeZip(files.map(f => ({
    path: f.path,
    read: async () => new Uint8Array(await f.file.arrayBuffer()),
  })), {
    compress: false,
    concurrency: 256,
    onProgress: (done, total) => {
      const percent = Math.floor(done / total * 100)
      if (percent === lastPercent) return;
      lastPercent = percent
      postMessage({ type: 'progress', done, total } satisfies PackWorkerMessage)
    },
  }) as Uint8Array<ArrayBuffer>
  postMessage({ type: 'result', bytes } satisfies PackWorkerMessage, { transfer: [bytes.buffer] })
}
