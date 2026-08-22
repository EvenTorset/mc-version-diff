<script setup lang="ts">
import { renderImageWithMode } from '@/shared_renderer'
import type { ImageViewMode } from '@/types'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  bitmap: ImageBitmap | null
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

async function render() {
  if (!props.bitmap || !canvas.value) return;

  if (!isIntersecting) {
    isDirty = true
    return;
  }

  if (isRendering) {
    isDirty = true
    return;
  }

  isRendering = true
  isDirty = false

  const requestId = ++currentRequestId
  const width = props.width ?? props.bitmap.width
  const height = props.height ?? props.bitmap.height

  try {
    if (props.mode === 'rgba') {
      if (!ctx) ctx = canvas.value.getContext('2d')
      if (ctx) {
        const c = canvas.value
        if (c.width !== width) c.width = width
        if (c.height !== height) c.height = height
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(props.bitmap, 0, 0, width, height)
      }
    } else {
      const renderedBitmap = await renderImageWithMode(
        props.bitmap,
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
    props.bitmap,
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
  props.bitmap?.close()
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
