import { readStream } from './ogg'

export interface PeaksRequest {
  bytes: Uint8Array<ArrayBuffer>
  buckets: number
}

export interface CompareRequest {
  a: Uint8Array<ArrayBuffer>
  b: Uint8Array<ArrayBuffer>
}

export interface PeaksProgress {
  peaks: Float32Array
  filled: number
  done: boolean
}

export interface CompareResult {
  same: boolean
}

type OggStream = NonNullable<ReturnType<typeof readStream>>

const PACKET_TIMESTAMP = 20000
const REPORT_FRAMES = 44100 * 10
const MATCH_DB = -45
const SLACK_FRAMES = 8192

async function decodeStream(stream: OggStream, onOutput: (data: AudioData) => void) {
  const decoder = new AudioDecoder({ output: onOutput, error: () => {} })
  decoder.configure({
    codec: 'vorbis',
    sampleRate: stream.sampleRate,
    numberOfChannels: stream.channels,
    description: stream.description,
  })

  let timestamp = 0
  for (const packet of stream.packets) {
    decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp, duration: PACKET_TIMESTAMP, data: packet }))
    timestamp += PACKET_TIMESTAMP
  }

  await decoder.flush().catch(() => {})
  decoder.close()
}

async function peaksOf(request: PeaksRequest) {
  const { bytes, buckets } = request
  const stream = readStream(bytes)
  if (!stream || !stream.frames) {
    self.postMessage({ peaks: new Float32Array(buckets * 2), filled: buckets, done: true })
    return;
  }

  const peaks = new Float32Array(buckets * 2)
  const channels = stream.channels
  const total = stream.frames
  let frame = 0
  let reported = 0
  let scratch = new Float32Array(0)

  const report = (done: boolean) => {
    const filled = Math.min(buckets, Math.floor((frame / total) * buckets))
    self.postMessage({ peaks: peaks.slice(0), filled, done })
  }

  const framesPerBucket = total / buckets
  const onOutput = (data: AudioData) => {
    const count = data.numberOfFrames
    if (scratch.length < count) scratch = new Float32Array(count)
    for (let channel = 0; channel < channels; channel++) {
      data.copyTo(scratch.subarray(0, count), { planeIndex: channel, format: 'f32-planar' })
      let i = 0
      while (i < count) {
        const bucket = Math.min(buckets - 1, Math.floor((frame + i) / framesPerBucket))
        const slot = bucket * 2
        const end = Math.min(count, Math.ceil((bucket + 1) * framesPerBucket) - frame)
        let min = peaks[slot]
        let max = peaks[slot + 1]
        for (let at = i; at < end; at++) {
          const value = scratch[at]
          if (value < min) min = value
          else if (value > max) max = value
        }
        peaks[slot] = min
        peaks[slot + 1] = max
        i = end > i ? end : i + 1
      }
    }
    frame += count
    data.close()
    if (frame - reported >= REPORT_FRAMES) {
      reported = frame
      report(false)
    }
  }

  await decodeStream(stream, onOutput)
  frame = total
  report(true)
}

async function sameAudio(request: CompareRequest) {
  const streamA = readStream(request.a)
  const streamB = readStream(request.b)
  if (!streamA || !streamB || !streamA.frames) return false
  if (streamA.channels !== streamB.channels) return false
  if (streamA.sampleRate !== streamB.sampleRate) return false
  if (streamA.frames !== streamB.frames) return false

  const channels = streamA.channels
  const capacity = streamA.frames + SLACK_FRAMES
  const planes = Array.from({ length: channels }, () => new Float32Array(capacity))
  let scratch = new Float32Array(0)
  let framesA = 0

  await decodeStream(streamA, data => {
    const size = data.numberOfFrames
    const count = Math.min(size, capacity - framesA)
    if (count > 0) {
      if (scratch.length < size) scratch = new Float32Array(size)
      for (let channel = 0; channel < channels; channel++) {
        data.copyTo(scratch.subarray(0, size), { planeIndex: channel, format: 'f32-planar' })
        planes[channel].set(scratch.subarray(0, count), framesA)
      }
      framesA += count
    }
    data.close()
  })

  if (!framesA) return false

  let framesB = 0
  let overrun = false
  let sum = 0
  let peak = 0

  await decodeStream(streamB, data => {
    const size = data.numberOfFrames
    const count = Math.min(size, framesA - framesB)
    if (count < size) overrun = true
    if (count > 0) {
      if (scratch.length < size) scratch = new Float32Array(size)
      for (let channel = 0; channel < channels; channel++) {
        data.copyTo(scratch.subarray(0, size), { planeIndex: channel, format: 'f32-planar' })
        const plane = planes[channel]
        for (let i = 0; i < count; i++) {
          const value = plane[framesB + i]
          const diff = value - scratch[i]
          sum += diff * diff
          const level = Math.abs(value)
          if (level > peak) peak = level
        }
      }
      framesB += count
    }
    data.close()
  })

  if (overrun || framesB !== framesA) return false

  const rms = Math.sqrt(sum / (framesA * channels))
  if (peak === 0) return rms === 0
  return 20 * Math.log10(rms / peak) < MATCH_DB
}

self.onmessage = async (event: MessageEvent<PeaksRequest | CompareRequest>) => {
  const request = event.data
  if ('buckets' in request) {
    await peaksOf(request)
    return;
  }
  self.postMessage({ same: await sameAudio(request) } satisfies CompareResult)
}
