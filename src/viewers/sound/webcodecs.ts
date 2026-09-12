import PeaksWorker from './oggPeaks.worker?worker'
import type { PeaksProgress, PeaksRequest } from './oggPeaks.worker'
import { readStream } from './ogg'

const MAX_WORKERS = Math.max(2, Math.min(8, Math.floor((navigator.hardwareConcurrency || 4) / 2)))

let supported: Promise<boolean> | null = null

export function vorbisSupported(bytes: Uint8Array<ArrayBuffer>): Promise<boolean> {
  supported ??= (async () => {
    if (typeof AudioDecoder === 'undefined') return false
    const stream = readStream(bytes)
    if (!stream) return false
    try {
      const check = await AudioDecoder.isConfigSupported({
        codec: 'vorbis',
        sampleRate: stream.sampleRate,
        numberOfChannels: stream.channels,
        description: stream.description,
      })
      return !!check.supported
    } catch {
      return false
    }
  })()
  return supported
}

const idle: Worker[] = []
const waiting: ((worker: Worker) => void)[] = []
let created = 0

function takeWorker(): Promise<Worker> {
  const free = idle.pop()
  if (free) return Promise.resolve(free)
  if (created < MAX_WORKERS) {
    created++
    return Promise.resolve(new PeaksWorker())
  }
  return new Promise((resolve) => waiting.push(resolve))
}

function releaseWorker(worker: Worker) {
  const next = waiting.shift()
  if (next) next(worker)
  else idle.push(worker)
}

export function peaksFromOgg(
  bytes: Uint8Array<ArrayBuffer>,
  buckets: number,
  onProgress: (peaks: Float32Array, filled: number) => void
): Promise<void> {
  return takeWorker().then((worker) => new Promise<void>((resolve) => {
    worker.onmessage = (event: MessageEvent<PeaksProgress>) => {
      onProgress(event.data.peaks, event.data.filled)
      if (!event.data.done) return;
      worker.onmessage = null
      releaseWorker(worker)
      resolve()
    }
    const copy = bytes.slice(0)
    worker.postMessage({ bytes: copy, buckets } satisfies PeaksRequest, [copy.buffer])
  }))
}
