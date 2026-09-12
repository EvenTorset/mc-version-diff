export interface WavInfo {
  channels: number
  sampleRate: number
  frames: number
  duration: number
  offset: number
  length: number
}

export function readWav(bytes: Uint8Array<ArrayBuffer>): WavInfo | null {
  if (bytes.length < 44) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) return null

  let at = 12
  let channels = 0
  let sampleRate = 0
  let bits = 0

  while (at + 8 <= bytes.length) {
    const id = view.getUint32(at, false)
    const size = view.getUint32(at + 4, true)
    const body = at + 8
    if (id === 0x666d7420) {
      if (view.getUint16(body, true) !== 1) return null
      channels = view.getUint16(body + 2, true)
      sampleRate = view.getUint32(body + 4, true)
      bits = view.getUint16(body + 14, true)
    } else if (id === 0x64617461) {
      if (!channels || !sampleRate || bits !== 16) return null
      const length = Math.min(size, bytes.length - body)
      const frames = Math.floor(length / 2 / channels)
      return { channels, sampleRate, frames, duration: frames / sampleRate, offset: body, length }
    }
    at = body + size + (size & 1)
  }

  return null
}

export function wavPeaks(bytes: Uint8Array<ArrayBuffer>, info: WavInfo, buckets: number): Float32Array {
  const peaks = new Float32Array(buckets * 2)
  if (!info.frames) return peaks

  const samples = new Int16Array(bytes.buffer, bytes.byteOffset + info.offset, info.frames * info.channels)
  const framesPerBucket = info.frames / buckets
  const scale = 1 / 32768

  for (let bucket = 0; bucket < buckets; bucket++) {
    const from = Math.floor(bucket * framesPerBucket) * info.channels
    const to = Math.min(samples.length, Math.ceil((bucket + 1) * framesPerBucket) * info.channels)
    let min = 0
    let max = 0
    for (let at = from; at < to; at++) {
      const value = samples[at]
      if (value < min) min = value
      else if (value > max) max = value
    }
    peaks[bucket * 2] = min * scale
    peaks[bucket * 2 + 1] = max * scale
  }

  return peaks
}
