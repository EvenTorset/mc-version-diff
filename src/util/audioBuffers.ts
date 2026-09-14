import { queueDecode } from '@/viewers/sound/decodeQueue'

const audioBufferCache = new WeakMap<Uint8Array, Promise<AudioBuffer>>()

let sharedAudioCtx: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return sharedAudioCtx
}

export function getAudioBuffer(bytes: Uint8Array<ArrayBuffer>): Promise<AudioBuffer> {
  let cached = audioBufferCache.get(bytes)
  if (!cached) {
    cached = queueDecode(0, () => {
      const ctx = getAudioContext()
      const copy = bytes.slice(0)
      return ctx.decodeAudioData(copy.buffer)
    })
    audioBufferCache.set(bytes, cached)
  }
  return cached
}
