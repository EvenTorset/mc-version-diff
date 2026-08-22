import { crc32, decompressBuffer } from '@/util/zip'

export type RehashPayloadItem = {
  key: string
  compressedContent: Uint8Array<ArrayBuffer>
  compressionMethod: number
}

export type RehashWorkerMessage =
  | { type: 'progress'; count: number; total: number }
  | { type: 'result'; results: Record<string, number> }

self.onmessage = async (event: MessageEvent<RehashPayloadItem[]>) => {
  const items = event.data
  const total = items.length
  const results: Record<string, number> = {}

  for (let i = 0; i < total; i++) {
    const item = items[i]

    let decompressed: Uint8Array
    if (item.compressionMethod === 0) {
      decompressed = item.compressedContent
    } else {
      const buffer = await decompressBuffer(item.compressedContent)
      decompressed = new Uint8Array(buffer)
    }

    results[item.key] = crc32(decompressed)

    if (i % 25 === 0 || i === total - 1) {
      self.postMessage({
        type: 'progress',
        count: i + 1,
        total,
      } as RehashWorkerMessage)
    }
  }

  self.postMessage({
    type: 'result',
    results,
  } as RehashWorkerMessage)
}
