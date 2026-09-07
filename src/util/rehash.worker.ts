import { crc32, inflateRaw } from '@/util/zip'

export type RehashPayloadItem = {
  key: string
  bytes: Uint8Array
  compression: string | null
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
    results[item.key] = crc32(item.compression ? await inflateRaw(item.bytes) : item.bytes)

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
