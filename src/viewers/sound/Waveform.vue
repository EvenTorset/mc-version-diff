<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import PeaksWorker from './peaks.worker?worker'
import { getCSSVar } from '@/util/getCSSVar'
import { useElementVisible } from '@/util/useElementVisible'
import IconButton from '@/components/IconButton.vue'
import Tooltip from '@/components/Tooltip.vue'
import { Settings } from '@/settings'
import { Pause16Filled, Play16Filled } from '@vicons/fluent'
import Row from '@/components/Row.vue'
import { splitOgg, type OggSplit } from './ogg'
import { queueDecode } from './decodeQueue'

export interface TrackSource {
  id: string
  version: string
  name: string
  color?: string
  bytes: Uint8Array<ArrayBuffer>
}

interface ProcessedTrack {
  id: string
  version: string
  name: string
  color?: string
  duration: number
  bytes: Uint8Array<ArrayBuffer>
  buffer: AudioBuffer | null
  peaks: Float32Array
}

interface PlaybackState {
  isPlaying: boolean
  waiting: boolean
  currentTime: number
  currentOffset: number
}

interface Transient {
  sourceNode: AudioBufferSourceNode | null
  gainNode: GainNode | null
  playbackStartTime: number
}

interface TrackEnvelope {
  trackWidth: number
  topPoints: number[]
  bottomPoints: number[]
}

interface Scrub {
  id: string
  pointerId: number
  wasPlaying: boolean
}

interface ScrubVoice {
  source: AudioBufferSourceNode
  gain: GainNode
}

const SCRUB_GRAIN = 0.12
const SCRUB_FADE = 0.012
const SCRUB_INTERVAL = 0.05
const SCRUB_MIN_STEP = 0.001
const CHUNK_SECONDS = 15
const PEAK_RATE = 8000

const props = withDefaults(
  defineProps<{
    sources: TrackSource[]
    laneHeight?: number
  }>(),
  {
    laneHeight: 100
  }
)

const containerRef = ref<HTMLDivElement>()
const waveformCanvasRef = ref<HTMLCanvasElement | null>(null)
const overlayCanvasRef = ref<HTMLCanvasElement | null>(null)

const isVisible = useElementVisible(containerRef)

const loadedTracks = ref<ProcessedTrack[]>([])
const isLoading = ref(false)
const hoverX = ref<number | null>(null)
const scrubbing = ref<Scrub | null>(null)
const playback = reactive<Record<string, PlaybackState>>({})

const audioBufferCache = new WeakMap<Uint8Array, Promise<AudioBuffer>>()
const peaksCache = new WeakMap<AudioBuffer, Map<number, Promise<Float32Array>>>()

let sharedAudioCtx: AudioContext | null = null
const transientByTrack = new Map<string, Transient>()
const scrubVoices = new Set<ScrubVoice>()
let lastGrainAt = 0
let lastScrubTime = 0
let animFrameId: number | null = null
let resizeObserver: ResizeObserver | null = null

const canvasHeight = computed(() => {
  return Math.max(1, loadedTracks.value.length) * props.laneHeight
})

const maxDuration = computed(() => {
  if (loadedTracks.value.length === 0) return 0
  return Math.max(...loadedTracks.value.map((t) => t.duration))
})

function getAudioContext(): AudioContext {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return sharedAudioCtx
}

function processPeaksInWorker(
  buffer: AudioBuffer,
  numBuckets: number
): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const worker = new PeaksWorker()

    const channelBuffers: Float32Array[] = []
    const transferables: ArrayBuffer[] = []

    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const channelData = buffer.getChannelData(c).slice()
      channelBuffers.push(channelData)
      transferables.push(channelData.buffer)
    }

    worker.onmessage = (e: MessageEvent<{ peaks: Float32Array }>) => {
      resolve(e.data.peaks)
      worker.terminate()
    }

    worker.onerror = (err) => {
      reject(err)
      worker.terminate()
    }

    worker.postMessage({ channelBuffers, numBuckets }, transferables)
  })
}

function getAudioBuffer(bytes: Uint8Array<ArrayBuffer>): Promise<AudioBuffer> {
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

function getPeaks(buffer: AudioBuffer, numBuckets: number): Promise<Float32Array> {
  let byBucketCount = peaksCache.get(buffer)
  if (!byBucketCount) {
    byBucketCount = new Map()
    peaksCache.set(buffer, byBucketCount)
  }
  let cached = byBucketCount.get(numBuckets)
  if (!cached) {
    cached = processPeaksInWorker(buffer, numBuckets)
    byBucketCount.set(numBuckets, cached)
  }
  return cached
}

async function loadSources() {
  const sources = props.sources

  stopAll()

  if (!sources || sources.length === 0) {
    loadedTracks.value = []
    return;
  }

  isLoading.value = true

  const dpr = window.devicePixelRatio || 1
  const containerWidth = containerRef.value?.clientWidth || 800
  const bucketCount = Math.max(1, Math.floor(containerWidth * dpr))

  try {
    const pending: { track: ProcessedTrack, split: OggSplit }[] = []
    const fetchedTracks = await Promise.all(
      sources.slice(0, 2).map(async (src) => {
        const meta = { id: src.id, version: src.version, name: src.name, color: src.color, bytes: src.bytes }
        const split = splitOgg(src.bytes, CHUNK_SECONDS)
        if (split && split.chunks.length > 1) {
          const track: ProcessedTrack = {
            ...meta,
            duration: split.duration,
            buffer: null,
            peaks: new Float32Array(bucketCount * 2)
          }
          pending.push({ track, split })
          return track
        }
        const buffer = await getAudioBuffer(src.bytes)
        const peaks = await getPeaks(buffer, bucketCount)
        return { ...meta, duration: buffer.duration, buffer, peaks }
      })
    )

    loadedTracks.value = fetchedTracks

    for (const { track, split } of pending) fillPeaks(track, split, bucketCount)

    const validIds = new Set(fetchedTracks.map((t) => t.id))
    for (const id of Object.keys(playback)) {
      if (!validIds.has(id)) delete playback[id]
    }
    for (const track of fetchedTracks) {
      if (!playback[track.id]) {
        playback[track.id] = { isPlaying: false, waiting: false, currentTime: 0, currentOffset: 0 }
      }
    }
  } catch (err) {
    console.error('Failed to process audio buffers:', err)
  } finally {
    isLoading.value = false
    await nextTick()
    renderWaveform()
    drawOverlay()
  }
}

function writePeaks(peaks: Float32Array, buffer: AudioBuffer, from: number, to: number) {
  const channels: Float32Array[] = []
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c))
  const perBucket = buffer.length / (to - from)

  for (let bucket = from; bucket < to; bucket++) {
    const start = Math.floor((bucket - from) * perBucket)
    const end = bucket === to - 1 ? buffer.length : Math.floor((bucket - from + 1) * perBucket)
    let min = 0
    let max = 0
    for (const channel of channels) {
      for (let i = start; i < end; i++) {
        const sample = channel[i]
        if (sample < min) min = sample
        if (sample > max) max = sample
      }
    }
    peaks[bucket * 2] = min
    peaks[bucket * 2 + 1] = max
  }
}

async function fillPeaks(track: ProcessedTrack, split: OggSplit, bucketCount: number) {
  const ctx = new OfflineAudioContext(1, 1, PEAK_RATE)
  for (const chunk of split.chunks) {
    if (!loadedTracks.value.includes(track)) return;
    let buffer: AudioBuffer
    try {
      buffer = await queueDecode(1, () => ctx.decodeAudioData(chunk.bytes.slice(0).buffer))
    } catch (err) {
      console.error('Failed to decode audio chunk:', err)
      return;
    }
    if (!loadedTracks.value.includes(track)) return;
    const from = Math.floor((chunk.start / split.duration) * bucketCount)
    const to = Math.min(bucketCount, Math.max(from + 1, Math.round((chunk.end / split.duration) * bucketCount)))
    writePeaks(track.peaks, buffer, from, to)
    renderWaveform()
  }
}

function unloadTracks() {
  stopAll()
  loadedTracks.value = []
}

function computeEnvelope(track: ProcessedTrack, width: number, maxDur: number): TrackEnvelope {
  const trackWidth = width * (track.duration / maxDur)
  const centerY = props.laneHeight / 2
  const halfHeight = props.laneHeight / 2 - 10

  let peakAmp = 0
  for (let i = 0; i < track.peaks.length; i++) {
    const absVal = Math.abs(track.peaks[i])
    if (absVal > peakAmp) peakAmp = absVal
  }
  const scaleFactor = peakAmp > 0 ? 1 / peakAmp : 1

  const numPairs = track.peaks.length / 2
  const renderWidth = Math.ceil(trackWidth)
  const topPoints: number[] = []
  const bottomPoints: number[] = []

  for (let x = 0; x < renderWidth; x++) {
    const tStart = (x / trackWidth) * track.duration
    const tEnd = Math.min(
      track.duration,
      ((x + 1) / trackWidth) * track.duration
    )

    const startBucket = Math.floor((tStart / track.duration) * numPairs)
    const endBucket = Math.min(
      numPairs - 1,
      Math.floor((tEnd / track.duration) * numPairs)
    )

    let min = 0
    let max = 0
    for (let b = startBucket; b <= endBucket; b++) {
      const bMin = track.peaks[b * 2]
      const bMax = track.peaks[b * 2 + 1]
      if (b === startBucket) {
        min = bMin
        max = bMax
      } else {
        if (bMin < min) min = bMin
        if (bMax > max) max = bMax
      }
    }

    topPoints.push(centerY - (max * scaleFactor) * halfHeight - 0.5)
    bottomPoints.push(centerY - (min * scaleFactor) * halfHeight + 0.5)
  }

  return { trackWidth, topPoints, bottomPoints }
}

function drawPlainWaveform(
  ctx: CanvasRenderingContext2D,
  laneY: number,
  topPoints: number[],
  bottomPoints: number[],
  color: string
) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, laneY + topPoints[0])
  for (let i = 1; i < topPoints.length; i++) {
    ctx.lineTo(i, laneY + topPoints[i])
  }
  for (let i = bottomPoints.length - 1; i >= 0; i--) {
    ctx.lineTo(i, laneY + bottomPoints[i])
  }
  ctx.closePath()
  ctx.fill()
}

function drawDiffWaveform(
  mainCtx: CanvasRenderingContext2D,
  width: number,
  laneHeight: number,
  laneY: number,
  topPoints: number[],
  bottomPoints: number[],
  otherTop: number[],
  otherBottom: number[],
  overlapWidth: number,
  highlightColor: string,
  color: string
) {
  const layer = document.createElement('canvas')
  layer.width = Math.max(1, Math.ceil(width))
  layer.height = Math.max(1, Math.ceil(laneHeight))
  const lctx = layer.getContext('2d')
  if (!lctx) return;

  lctx.fillStyle = highlightColor
  lctx.beginPath()
  lctx.moveTo(0, topPoints[0])
  for (let i = 1; i < topPoints.length; i++) {
    lctx.lineTo(i, topPoints[i])
  }
  for (let i = bottomPoints.length - 1; i >= 0; i--) {
    lctx.lineTo(i, bottomPoints[i])
  }
  lctx.closePath()
  lctx.fill()

  const n = Math.min(topPoints.length, otherTop.length, Math.ceil(overlapWidth))
  if (n > 0) {
    const overlapTop: number[] = []
    const overlapBottom: number[] = []
    const EPSILON = 0.1
    const PADDING = 2

    for (let i = 0; i < n; i++) {
      let top = Math.max(topPoints[i], otherTop[i])
      let bottom = Math.min(bottomPoints[i], otherBottom[i])

      if (top > bottom) {
        const mid = (topPoints[i] + bottomPoints[i]) / 2
        overlapTop.push(mid)
        overlapBottom.push(mid)
      } else {
        if (Math.abs(topPoints[i] - otherTop[i]) < EPSILON || otherTop[i] <= topPoints[i]) {
          top = topPoints[i] - PADDING
        }
        if (Math.abs(bottomPoints[i] - otherBottom[i]) < EPSILON || otherBottom[i] >= bottomPoints[i]) {
          bottom = bottomPoints[i] + PADDING
        }

        overlapTop.push(top)
        overlapBottom.push(bottom)
      }
    }

    lctx.globalCompositeOperation = 'source-atop'
    lctx.fillStyle = color
    lctx.beginPath()
    lctx.moveTo(0, overlapTop[0])
    for (let i = 1; i < n; i++) {
      lctx.lineTo(i, overlapTop[i])
    }
    for (let i = n - 1; i >= 0; i--) {
      lctx.lineTo(i, overlapBottom[i])
    }
    lctx.closePath()
    lctx.fill()
    lctx.globalCompositeOperation = 'source-over'
  }

  mainCtx.drawImage(layer, 0, laneY)
}

function syncCanvasSize(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
}

function renderWaveform() {
  const canvas = waveformCanvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return;

  const ctx = canvas.getContext('2d')
  if (!ctx) return;

  const width = container.clientWidth
  const height = canvasHeight.value
  const maxDur = maxDuration.value
  const dpr = window.devicePixelRatio || 1

  syncCanvasSize(canvas, width, height, dpr)
  if (overlayCanvasRef.value) syncCanvasSize(overlayCanvasRef.value, width, height, dpr)

  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)

  if (loadedTracks.value.length === 0 || maxDur === 0) {
    ctx.fillStyle = '#121214'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#64748b'
    ctx.font = '14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('No audio loaded', width / 2, height / 2)
    ctx.restore()
    return;
  }

  const isComparison = loadedTracks.value.length === 2
  const envelopes = loadedTracks.value.map((track) => computeEnvelope(track, width, maxDur))

  for (let i = 0; i < loadedTracks.value.length; i++) {
    const laneY = i * props.laneHeight
    const { trackWidth, topPoints, bottomPoints } = envelopes[i]

    // Background
    ctx.fillStyle = getCSSVar('--color-0-alt')
    ctx.fillRect(0, laneY, width, props.laneHeight)

    // Lane divider
    if (i > 0) {
      ctx.strokeStyle = getCSSVar('--color-2')
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, laneY)
      ctx.lineTo(width, laneY)
      ctx.stroke()
    }

    if (topPoints.length === 0) return;

    if (isComparison) {
      const otherIndex = i === 0 ? 1 : 0
      const other = envelopes[otherIndex]
      const overlapWidth = Math.min(trackWidth, other.trackWidth)
      const highlightColor = i === 0 ? getCSSVar('--color-danger') : getCSSVar('--color-success')

      drawDiffWaveform(
        ctx,
        width,
        props.laneHeight,
        laneY,
        topPoints,
        bottomPoints,
        other.topPoints,
        other.bottomPoints,
        overlapWidth,
        highlightColor,
        getCSSVar('--color-6')
      )
    } else {
      drawPlainWaveform(ctx, laneY, topPoints, bottomPoints, getCSSVar(loadedTracks.value[i].color ?? '--color-accent'))
    }
  }

  ctx.restore()
}

function drawOverlay() {
  const canvas = overlayCanvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return;

  const ctx = canvas.getContext('2d')
  if (!ctx) return;

  const width = container.clientWidth
  const height = canvasHeight.value
  const maxDur = maxDuration.value
  const dpr = window.devicePixelRatio || 1

  syncCanvasSize(canvas, width, height, dpr)

  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)

  if (maxDur > 0) {
    loadedTracks.value.forEach((track, index) => {
      const state = playback[track.id]
      if (!state) return;

      const laneY = index * props.laneHeight
      const x = (state.currentTime / maxDur) * width

      ctx.strokeStyle = getCSSVar('--color-5')
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, laneY)
      ctx.lineTo(x, laneY + props.laneHeight)
      ctx.stroke()

      ctx.fillStyle = getCSSVar('--color-5')
      ctx.beginPath()
      ctx.moveTo(x - 5, laneY)
      ctx.lineTo(x + 5, laneY)
      ctx.lineTo(x, laneY + 7)
      ctx.closePath()
      ctx.fill()
    })
  }

  if (hoverX.value !== null) {
    ctx.beginPath()
    ctx.moveTo(hoverX.value + 0.5, 0)
    ctx.lineTo(hoverX.value + 0.5, height)
    ctx.strokeStyle = getCSSVar('--color-0')
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.strokeStyle = getCSSVar('--color-6')
    ctx.lineWidth = 1
    ctx.stroke()
  }

  ctx.restore()
}

function ensurePlaybackState(id: string): PlaybackState {
  if (!playback[id]) {
    playback[id] = { isPlaying: false, waiting: false, currentTime: 0, currentOffset: 0 }
  }
  return playback[id]
}

function getTransient(id: string): Transient {
  let transient = transientByTrack.get(id)
  if (!transient) {
    transient = { sourceNode: null, gainNode: null, playbackStartTime: 0 }
    transientByTrack.set(id, transient)
  }
  return transient
}

function findTrack(id: string): ProcessedTrack | null {
  return loadedTracks.value.find((t) => t.id === id) || null
}

function playTrack(id: string) {
  const track = findTrack(id)
  const state = ensurePlaybackState(id)
  if (!track?.buffer || state.isPlaying) return;

  const ctx = getAudioContext()
  if (ctx.state === 'suspended') {
    ctx.resume()
  }

  if (state.currentOffset >= track.duration) {
    state.currentOffset = 0
  }

  const transient = getTransient(id)
  const source = ctx.createBufferSource()
  source.buffer = track.buffer

  const gain = ctx.createGain()
  gain.gain.value = volumeToGain(Settings.volume)
  gain.connect(ctx.destination)
  source.connect(gain)

  transient.sourceNode = source
  transient.gainNode = gain
  transient.playbackStartTime = ctx.currentTime

  source.start(0, state.currentOffset)
  state.isPlaying = true

  source.onended = () => {
    if (state.isPlaying) stopTrack(id)
  }

  ensureAnimationLoop()
}

function pauseTrack(id: string) {
  const state = playback[id]
  if (!state || !state.isPlaying) return;

  const transient = getTransient(id)
  if (transient.sourceNode) {
    transient.sourceNode.onended = null
    transient.sourceNode.stop()
    transient.sourceNode.disconnect()
    transient.sourceNode = null
  }
  if (transient.gainNode) {
    transient.gainNode.disconnect()
    transient.gainNode = null
  }

  state.currentOffset = state.currentTime
  state.isPlaying = false
  drawOverlay()
}

function stopTrack(id: string) {
  pauseTrack(id)
  const state = playback[id]
  if (state) {
    state.currentOffset = 0
    state.currentTime = 0
  }
  drawOverlay()
}

function stopAll() {
  scrubbing.value = null
  stopScrubVoices()
  for (const id of Object.keys(playback)) {
    stopTrack(id)
  }
}

function ensureBuffer(track: ProcessedTrack): Promise<AudioBuffer | null> {
  if (track.buffer) return Promise.resolve(track.buffer)
  return getAudioBuffer(track.bytes).then((buffer) => {
    if (loadedTracks.value.includes(track)) track.buffer = buffer
    return buffer
  }).catch((err) => {
    console.error('Failed to decode audio:', err)
    return null
  })
}

async function toggleTrackPlay(id: string) {
  const state = ensurePlaybackState(id)
  if (state.isPlaying) {
    pauseTrack(id)
    return;
  }
  const track = findTrack(id)
  if (track && !track.buffer) {
    if (state.waiting) return;
    state.waiting = true
    await ensureBuffer(track)
    state.waiting = false
    if (!loadedTracks.value.includes(track)) return;
  }
  playTrack(id)
}

function seekTrack(id: string, timeInSeconds: number) {
  const track = findTrack(id)
  if (!track) return;

  const state = ensurePlaybackState(id)
  const wasPlaying = state.isPlaying
  const clampedTime = Math.max(0, Math.min(timeInSeconds, track.duration))

  pauseTrack(id)
  state.currentOffset = clampedTime
  state.currentTime = clampedTime

  if (wasPlaying) playTrack(id)
  else drawOverlay()
}

function ensureAnimationLoop() {
  if (animFrameId !== null) return;

  const step = () => {
    const ctx = getAudioContext()
    let anyPlaying = false

    for (const [id, state] of Object.entries(playback)) {
      if (!state.isPlaying) continue

      const transient = transientByTrack.get(id)
      const track = findTrack(id)
      if (!transient || !track) continue

      const elapsed = ctx.currentTime - transient.playbackStartTime
      const total = state.currentOffset + elapsed

      if (total >= track.duration) {
        stopTrack(id)
      } else {
        state.currentTime = total
        anyPlaying = true
      }
    }

    drawOverlay()
    animFrameId = anyPlaying ? requestAnimationFrame(step) : null
  }

  animFrameId = requestAnimationFrame(step)
}

function playScrubGrain(track: ProcessedTrack, time: number) {
  if (!track.buffer) return;
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  if (ctx.currentTime - lastGrainAt < SCRUB_INTERVAL) return;

  const offset = Math.max(0, Math.min(time, track.duration))
  const duration = Math.min(SCRUB_GRAIN, track.duration - offset)
  if (duration <= 0) return;

  lastGrainAt = ctx.currentTime
  const fade = Math.min(SCRUB_FADE, duration / 3)
  const peak = volumeToGain(Settings.volume)
  const start = ctx.currentTime

  const source = ctx.createBufferSource()
  source.buffer = track.buffer
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(peak, start + fade)
  gain.gain.setValueAtTime(peak, start + duration - fade)
  gain.gain.linearRampToValueAtTime(0, start + duration)
  gain.connect(ctx.destination)
  source.connect(gain)

  const voice = { source, gain }
  scrubVoices.add(voice)
  source.onended = () => {
    source.disconnect()
    gain.disconnect()
    scrubVoices.delete(voice)
  }
  source.start(start, offset, duration)
}

function stopScrubVoices() {
  if (!scrubVoices.size) return;
  const ctx = getAudioContext()
  const now = ctx.currentTime
  for (const { source, gain } of scrubVoices) {
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(0, now + SCRUB_FADE)
    source.stop(now + SCRUB_FADE)
  }
}

function timeAt(clientX: number, rect: DOMRect): number {
  return ((clientX - rect.left) / rect.width) * maxDuration.value
}

function handlePointerDown(e: PointerEvent) {
  const canvas = overlayCanvasRef.value
  if (!canvas || e.button !== 0) return;

  const rect = canvas.getBoundingClientRect()
  const laneIndex = Math.floor((e.clientY - rect.top) / props.laneHeight)
  const track = loadedTracks.value[laneIndex]
  if (!track) return;

  e.preventDefault()
  const state = ensurePlaybackState(track.id)
  scrubbing.value = { id: track.id, pointerId: e.pointerId, wasPlaying: state.isPlaying }
  canvas.setPointerCapture(e.pointerId)

  pauseTrack(track.id)
  ensureBuffer(track)
  hoverX.value = e.clientX - rect.left
  seekTrack(track.id, timeAt(e.clientX, rect))
  lastScrubTime = state.currentTime
}

function handlePointerMove(e: PointerEvent) {
  const canvas = overlayCanvasRef.value
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect()
  hoverX.value = e.clientX - rect.left

  const active = scrubbing.value
  const track = active ? findTrack(active.id) : null
  if (active && track && active.pointerId === e.pointerId) {
    seekTrack(active.id, timeAt(e.clientX, rect))
    const time = playback[active.id].currentTime
    if (Math.abs(time - lastScrubTime) > SCRUB_MIN_STEP) {
      lastScrubTime = time
      playScrubGrain(track, time)
    }
  }

  drawOverlay()
}

function handlePointerUp(e: PointerEvent) {
  const active = scrubbing.value
  if (!active || active.pointerId !== e.pointerId) return;

  scrubbing.value = null
  overlayCanvasRef.value?.releasePointerCapture(e.pointerId)
  stopScrubVoices()
  if (active.wasPlaying) playTrack(active.id)
}

function handlePointerLeave() {
  if (scrubbing.value) return;
  hoverX.value = null
  drawOverlay()
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(3)
  return `${mins}:${secs.padStart(6, '0')}`
}

function volumeToGain(x: number): number {
  return 10 ** ((-40 * (1 - x)) / 20)
}

watch(
  () => Settings.volume,
  (val) => {
    for (const transient of transientByTrack.values()) {
      if (transient.gainNode) transient.gainNode.gain.value = volumeToGain(val)
    }
  }
)

watch(isVisible, (visible) => {
  if (visible) loadSources()
  else unloadTracks()
})

watch(
  () => props.sources,
  () => {
    if (isVisible.value) loadSources()
  },
  { deep: true }
)

onMounted(() => {
  if (isVisible.value) loadSources()

  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      renderWaveform()
      drawOverlay()
    })
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  stopAll()
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})
</script>

<template>
  <div class="waveform-comparer">
    <div
      ref="containerRef"
      class="canvas-container"
      :style="{ height: `${canvasHeight}px` }"
    >
      <canvas ref="waveformCanvasRef" class="waveform-canvas"></canvas>

      <template v-for="(track, index) in loadedTracks" :key="'hatch-' + track.id">
        <div
          v-if="maxDuration > 0 && track.duration < maxDuration"
          class="hatch-overlay"
          :style="{
            top: `${index * laneHeight}px`,
            height: `${laneHeight}px`,
            left: `${(track.duration / maxDuration) * 100}%`,
            width: `${(1 - track.duration / maxDuration) * 100}%`
          }"
        ></div>
      </template>

      <canvas
        ref="overlayCanvasRef"
        class="overlay-canvas"
        :class="{ scrubbing }"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerUp"
        @pointerleave="handlePointerLeave"
      ></canvas>

      <div class="lanes-overlay">
        <div
          v-for="track in loadedTracks"
          :key="track.id"
          class="lane-overlay"
          :style="{ height: `${laneHeight}px` }"
        >
          <div class="lane-top">
            <span class="track-title">{{ track.version }} · {{ track.name }}</span>
          </div>

          <div class="lane-bottom">
            <Row gap="12px" align="flex-end">
              <Tooltip>
                <template #trigger="{ props: tooltipProps }">
                  <IconButton
                    v-bind="tooltipProps"
                    class="accent"
                    style="pointer-events: auto;"
                    :disabled="playback[track.id]?.waiting"
                    @click.stop="toggleTrackPlay(track.id)"
                  >
                    <Pause16Filled v-if="playback[track.id]?.isPlaying" />
                    <Play16Filled v-else />
                  </IconButton>
                </template>
                <h3>{{ playback[track.id]?.waiting ? 'Decoding' : playback[track.id]?.isPlaying ? 'Pause' : 'Play' }}</h3>
              </Tooltip>

              <span class="time-display">
                {{ formatTime(playback[track.id]?.currentTime ?? 0) }} / {{ formatTime(track.duration) }}
              </span>
            </Row>
          </div>
        </div>
      </div>

      <div v-if="isLoading" class="loading-overlay">
        <span>Decoding audio & extracting peaks...</span>
      </div>
    </div>
  </div>
</template>

<style scoped>

.waveform-comparer {
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: hidden;
}

.canvas-container {
  position: relative;
  width: 100%;
}

.waveform-canvas,
.overlay-canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
}

.hatch-overlay {
  position: absolute;
  pointer-events: none;
  --line-width: 8px;
  --line-color-1: var(--color-1);
  --line-color-2: var(--color-2);
  background: repeating-linear-gradient(
    -45deg,
    var(--line-color-2), var(--line-color-2) var(--line-width),
    var(--line-color-1) var(--line-width), var(--line-color-1) calc(var(--line-width) * 2)
  );
}

.waveform-canvas {
  pointer-events: none;
}

.overlay-canvas {
  cursor: pointer;
  touch-action: pan-y;
  user-select: none;
}

.overlay-canvas.scrubbing {
  cursor: grabbing;
}

.lanes-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  pointer-events: none;
}

.lane-overlay {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 4px 6px;
  box-sizing: border-box;
  pointer-events: none;
}

.lane-top,
.lane-bottom {
  display: flex;
  align-items: center;
  pointer-events: none;
}

.track-title {
  color: var(--color-6);
  font-size: 12px;
  font-family: var(--font-family);
  user-select: none;
  pointer-events: none;
  text-shadow: 0 1px 1px #000;
  font-weight: 600;
  background-color: rgb(from var(--color-0) r g b / 0.4);
  border-radius: 4px;
  margin: 0 -3px 0 3px;
  padding: 0 3px;
}

.time-display {
  color: var(--color-6);
  font-size: 12px;
  font-family: var(--monospace-font-family);
  user-select: none;
  text-shadow: 0 1px 1px #000;
  font-weight: 600;
  background-color: rgb(from var(--color-0) r g b / 0.4);
  border-radius: 4px;
  margin: 0 -3px;
  padding: 0 3px;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(9, 9, 11, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-5);
  font-size: 14px;
}

</style>
