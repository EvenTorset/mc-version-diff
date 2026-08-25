<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  bitmap: ImageBitmap | null
  width?: number
  height?: number
}>()

const canvas = ref<HTMLCanvasElement | null>(null)

let isIntersecting = false
let isDirty = true
let isRendering = false

let ctx: CanvasRenderingContext2D | null = null
let observer: IntersectionObserver | null = null

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

  const width = props.width ?? props.bitmap.width
  const height = props.height ?? props.bitmap.height

  try {
    if (!ctx) ctx = canvas.value.getContext('2d')
    if (ctx) {
      const c = canvas.value
      if (c.width !== width) c.width = width
      if (c.height !== height) c.height = height
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(props.bitmap, 0, 0, width, height)
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
