interface PeakWorkerInput {
  channelBuffers: Float32Array[]
  numBuckets: number
}

interface PeakWorkerOutput {
  // Interleaved array: [min, max, min, max, ...] per bucket
  peaks: Float32Array
}

self.onmessage = (event: MessageEvent<PeakWorkerInput>) => {
  const { channelBuffers, numBuckets } = event.data
  if (!channelBuffers.length || numBuckets <= 0) return;

  const numChannels = channelBuffers.length
  const totalSamples = channelBuffers[0].length
  const samplesPerBucket = Math.floor(totalSamples / numBuckets)

  // Allocate result buffer: 2 floats (min & max) per bucket
  const peaks = new Float32Array(numBuckets * 2)

  for (let b = 0; b < numBuckets; b++) {
    const start = b * samplesPerBucket
    // Ensure the last bucket catches remaining samples from rounding
    const end = b === numBuckets - 1 ? totalSamples : start + samplesPerBucket

    let min = 1.0
    let max = -1.0

    // Aggregate samples across all channels for a combined waveform envelope
    for (let c = 0; c < numChannels; c++) {
      const channel = channelBuffers[c]
      for (let i = start; i < end; i++) {
        const sample = channel[i]
        if (sample < min) min = sample
        if (sample > max) max = sample
      }
    }

    // Fallback for silence or empty range
    if (min > max) {
      min = 0
      max = 0
    }

    const offset = b * 2
    peaks[offset] = min
    peaks[offset + 1] = max
  }

  // Transfer the resulting peaks Float32Array buffer back to main thread
  const response: PeakWorkerOutput = { peaks }
  self.postMessage(response, { transfer: [peaks.buffer] })
}
