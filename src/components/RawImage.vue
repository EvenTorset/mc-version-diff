<script setup lang="ts">
import { renderImageWithMode } from '@/shared_renderer'
import type { ImageViewMode } from '@/types'
import { imageFromBytes, imageFromBytesOwned } from '@/util/imageFromBytes'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  bytes: Uint8Array<ArrayBuffer> | null
  width?: number
  height?: number
  mode?: ImageViewMode
}>(), {
  mode: 'rgba',
})

const canvas = ref<HTMLCanvasElement | null>(null)

let isIntersecting = false
let isDirty = true
let isRendering = false

let ctx: CanvasRenderingContext2D | null = null
let observer: IntersectionObserver | null = null
let currentRequestId = 0

let decodedBitmap: ImageBitmap | null = null
let decodedForBytes: Uint8Array<ArrayBuffer> | null = null

async function ensureDecoded() {
  if (!props.bytes) {
    decodedBitmap = null
    decodedForBytes = null
    return
  }

  if (decodedForBytes === props.bytes && decodedBitmap) return

  const bytes = props.bytes
  const bitmap = await imageFromBytes(bytes)

  // Bail out if bytes changed again while we were decoding
  if (props.bytes !== bytes) return

  decodedBitmap = bitmap
  decodedForBytes = bytes
}

async function render() {
  if (!canvas.value) return

  if (!isIntersecting) {
    isDirty = true
    return
  }

  if (isRendering) {
    isDirty = true
    return
  }

  isRendering = true
  isDirty = false

  const requestId = ++currentRequestId

  try {
    await ensureDecoded()

    if (requestId !== currentRequestId || !decodedBitmap || !canvas.value) {
      isDirty = true
      return
    }

    const width = props.width ?? decodedBitmap.width
    const height = props.height ?? decodedBitmap.height

    if (props.mode === 'rgba') {
      if (!ctx) ctx = canvas.value.getContext('2d')
      if (ctx) {
        const c = canvas.value
        if (c.width !== width) c.width = width
        if (c.height !== height) c.height = height
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(decodedBitmap, 0, 0, width, height)
      }
    } else {
      // The worker transfers (consumes) whatever bitmap it's given, so
      // decode a dedicated one from the source bytes rather than reusing
      // decodedBitmap, which is still needed for future rgba redraws.
      const workerBitmap = await imageFromBytesOwned(props.bytes!)

      if (requestId !== currentRequestId || !canvas.value) {
        workerBitmap.close()
        isDirty = true
        return
      }

      const renderedBitmap = await renderImageWithMode(
        workerBitmap,
        props.mode,
        width,
        height,
      )

      if (requestId === currentRequestId && canvas.value) {
        if (!ctx) ctx = canvas.value.getContext('2d')
        if (ctx) {
          const c = canvas.value
          if (c.width !== width) c.width = width
          if (c.height !== height) c.height = height
          ctx.clearRect(0, 0, width, height)
          ctx.drawImage(renderedBitmap, 0, 0, width, height)
        }
      } else {
        isDirty = true
      }

      renderedBitmap.close()
    }
  } catch (err) {
    console.error('Failed to render image:', err)
    isDirty = true
  } finally {
    isRendering = false

    if (isDirty) {
      requestAnimationFrame(render)
    }
  }
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      const lastEntry = entries[entries.length - 1]
      isIntersecting = lastEntry.isIntersecting

      if (isIntersecting && isDirty) {
        render()
      }
    },
    { rootMargin: '600px 0px 600px 0px' },
  )

  if (canvas.value) {
    observer.observe(canvas.value)
  }
})

watch(
  () => [
    props.bytes,
    props.width,
    props.height,
    props.mode,
  ],
  () => {
    isDirty = true
    render()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (observer && canvas.value) {
    observer.unobserve(canvas.value)
    observer.disconnect()
  }
  decodedBitmap = null
})
</script>

<template>
  <canvas
    ref="canvas"
    :style="{
      imageRendering: 'pixelated',
      background: 'var(--checkerboard)',
    }"
  ></canvas>
</template>
