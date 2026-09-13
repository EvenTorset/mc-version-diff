import { readStream } from './ogg'

export interface PeaksRequest {
  bytes: Uint8Array<ArrayBuffer>
  buckets: number
}

export interface PeaksProgress {
  peaks: Float32Array
  filled: number
  done: boolean
}

const PACKET_TIMESTAMP = 20000
const REPORT_FRAMES = 44100 * 10
const WINDOWS_PER_BUCKET = 2

self.onmessage = async (event: MessageEvent<PeaksRequest>) => {
  const { bytes, buckets } = event.data
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
  const window = framesPerBucket / WINDOWS_PER_BUCKET
  let wanted = 0

  const onOutput = (data: AudioData) => {
    const count = data.numberOfFrames
    if (frame + count <= wanted) {
      frame += count
      data.close()
      return;
    }
    wanted = frame + Math.max(count, window)

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

  const decoder = new AudioDecoder({ output: onOutput, error: () => {} })
  decoder.configure({
    codec: 'vorbis',
    sampleRate: stream.sampleRate,
    numberOfChannels: channels,
    description: stream.description,
  })

  let timestamp = 0
  for (const packet of stream.packets) {
    decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp, duration: PACKET_TIMESTAMP, data: packet }))
    timestamp += PACKET_TIMESTAMP
  }

  await decoder.flush().catch(() => {})
  decoder.close()
  frame = total
  report(true)
}
