<script setup lang="ts">
import type { DeltaResult } from '@/delta_providers'
import { renderTexture } from '@/util/blockModelRenderer'
import { DEFAULT_FRAMES, numberedFrames } from '@/util/numberedFrames'
import { renderImageWithMode } from '@/shared_renderer'
import type { ImageViewMode } from '@/types'
import { popupable } from '@/util/popupable'
import { bitmapToPng } from '@/util/pngBytes'
import { deltaVirtualHandler } from '@/util/virtualHandler'
import { NSpin } from 'naive-ui'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import FitBox from './FitBox.vue'
import MediaColumn from './MediaColumn.vue'

const TEXTURE = 'assets/minecraft/textures/animation.png'

const props = defineProps<{
  dr: DeltaResult
  version: string
  mcmeta: string
  texture?: string
  numbered?: boolean
  label?: string
  group?: string
  mode?: ImageViewMode
}>()

const emit = defineEmits<{
  update: []
  stats: [{ frames: number, duration: number }]
}>()

const containerRef = ref<HTMLDivElement>()
const loading = ref(true)
const failed = ref(false)
const info = ref('')
const size = ref({ width: 16, height: 16 })
const playerCanvas = shallowRef<HTMLCanvasElement>()

let player: {
  canvas: HTMLCanvasElement
  duration: number
  onUpdate?: () => void
  dispose(): void
} | null = null

// a frames array defines the animation, so its length is the frame count; the
// strip still has to span the highest index it references
function arrayFrames(animation: any) {
  const frames = animation?.frames
  if (!Array.isArray(frames) || !frames.length) return null
  const highest = Math.max(...frames.map((frame: any) =>
    typeof frame === 'number' ? frame : frame?.index ?? 0))
  return { count: frames.length, span: Math.max(1, highest + 1) }
}

async function source(read: (path: string) => Promise<Uint8Array | null>) {
  const animation = JSON.parse(props.mcmeta).animation

  const bytes = props.texture ? await read(props.texture).catch(() => null) : null
  const image = bytes
    ? await createImageBitmap(new Blob([ bytes as BlobPart ])).catch(() => null)
    : null
  const size = image ? frameSize(animation, image.width, image.height) : null
  const sheetFrames = image && size
    ? Math.max(1, Math.round((image.width / size.width) * (image.height / size.height)))
    : null
  const declared = arrayFrames(animation)
  const frames = declared?.count ?? sheetFrames

  if (!props.numbered) {
    if (!bytes || !size || !frames) throw new Error(`no texture at ${props.texture}`)
    return { bytes, ...size, frames }
  }

  const strip = await numberedFrames(declared?.span ?? sheetFrames ?? DEFAULT_FRAMES, declared === null)
  return { bytes: strip.bytes, width: strip.width, height: strip.height, frames: frames ?? strip.frames }
}

function playedMeta() {
  if (!props.numbered) return props.mcmeta
  const meta = JSON.parse(props.mcmeta)
  delete meta.animation.width
  delete meta.animation.height
  return JSON.stringify(meta)
}

function frameSize(animation: any, spriteWidth: number, spriteHeight: number) {
  if (animation?.width !== undefined) {
    return { width: animation.width, height: animation.height ?? spriteHeight }
  }
  if (animation?.height !== undefined) return { width: spriteWidth, height: animation.height }
  const min = Math.min(spriteWidth, spriteHeight)
  return { width: min, height: min }
}

let buildRun = 0

async function build() {
  const run = ++buildRun
  loading.value = true
  failed.value = false
  try {
    const handler = deltaVirtualHandler(props.dr, props.version)
    const { bytes, width, height, frames } = await source(
      async path => (await handler.read(path)) as Uint8Array | null,
    )

    const meta = new TextEncoder().encode(playedMeta())
    const shown = await withMode(bytes)
    const assets = {
      async read(path: string) {
        if (path === TEXTURE) return shown
        if (path === `${TEXTURE}.mcmeta`) return meta
        return null
      },
      async list() { return [] },
    }

    const animation = await renderTexture({
      texture: TEXTURE,
      assets,
      animated: true,
      width,
      height,
    })
    if (run !== buildRun) return animation.dispose()

    player?.canvas.remove()
    player?.dispose()
    player = animation
    animation.onUpdate = () => emit('update')
    size.value = { width, height }
    info.value = `${frames} frames · ${Math.round(animation.duration) / 1000}s`
    emit('stats', { frames: frames!, duration: animation.duration })
    // popupable mirrors a live canvas, so the attributes have to sit on the canvas itself
    for (const [ attr, value ] of Object.entries(popupable({
      title: props.label ?? props.version,
      description: info.value,
      group: props.group,
      thumbnails: true,
      zoom: true,
    }))) {
      if (value != null) animation.canvas.setAttribute(attr, String(value))
    }
    containerRef.value?.append(animation.canvas)
    playerCanvas.value = animation.canvas
    emit('update')
  } catch {
    // a failed rebuild keeps the old animation on screen, so only report when there is nothing
    if (run === buildRun) failed.value = !player
  }
  if (run === buildRun) loading.value = false
}

// the player draws the texture as-is, so the channel view has to be baked into the sheet first
async function withMode(bytes: Uint8Array) {
  if (!props.mode || props.mode === 'rgba') return bytes
  const sheet = await createImageBitmap(new Blob([ bytes as BlobPart ]))
  const rendered = await renderImageWithMode(sheet, props.mode, sheet.width, sheet.height)
  const encoded = await bitmapToPng(rendered)
  rendered.close()
  return encoded
}

defineExpose({ playerCanvas })

onMounted(build)
watch(() => [ props.numbered, props.mode ], build)

onBeforeUnmount(() => player?.dispose())
</script>

<template>
  <MediaColumn :title="label">
    <NSpin v-if="loading && !playerCanvas" size="small" />
    <div v-else-if="failed" class="animation-failed">This animation could not be played.</div>
    <FitBox
      v-show="playerCanvas"
      :width="size.width"
      :height="size.height"
      :max-width="512"
      :max-height="128"
    >
      <div ref="containerRef" class="animation-canvas"></div>
    </FitBox>
    <template #caption><slot name="caption">{{ info }}</slot></template>
  </MediaColumn>
</template>

<style lang="scss" scoped>

.animation-canvas :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  background: var(--checkerboard);
}

.animation-failed {
  font-size: 12px;
  color: var(--color-4);
}

</style>
