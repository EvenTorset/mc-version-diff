<script setup lang="ts">
import { createDiffer } from '@/util/imageDiff'
import { popupable } from '@/util/popupable'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import FitBox from './FitBox.vue'
import MediaColumn from './MediaColumn.vue'

const props = defineProps<{
  sourceA: () => HTMLCanvasElement | null | undefined
  sourceB: () => HTMLCanvasElement | null | undefined
  label?: string
  caption?: string
  group?: string
}>()

const containerRef = ref<HTMLDivElement>()
const size = ref({ width: 16, height: 16 })
const ready = ref(false)

let differ: ReturnType<typeof createDiffer> | null = null
let frame = 0

function rebuild(width: number, height: number) {
  differ?.canvas.remove()
  differ?.dispose()
  differ = createDiffer(width, height)
  size.value = { width, height }
  for (const [ attr, value ] of Object.entries(popupable({
    title: props.label,
    description: props.caption,
    group: props.group,
    thumbnails: true,
    zoom: true,
  }))) {
    if (value != null) differ.canvas.setAttribute(attr, String(value))
  }
  containerRef.value?.append(differ.canvas)
  ready.value = true
}

function draw() {
  frame = 0

  const a = props.sourceA()
  const b = props.sourceB()
  if (!a?.width || !b?.width) return

  const width = Math.max(a.width, b.width)
  const height = Math.max(a.height, b.height)
  if (!differ || differ.canvas.width !== width || differ.canvas.height !== height) {
    rebuild(width, height)
  }
  differ!.draw(a, b)
}

// both sides repaint in the same tick, so coalesce their updates into one draw
function requestDraw() {
  frame ||= requestAnimationFrame(draw)
}

defineExpose({ requestDraw })

onMounted(requestDraw)

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  differ?.dispose()
})
</script>

<template>
  <MediaColumn :title="label">
    <FitBox
      v-show="ready"
      :width="size.width"
      :height="size.height"
      :max-width="512"
      :max-height="128"
    >
      <div ref="containerRef" class="difference-canvas"></div>
    </FitBox>
    <template v-if="caption" #caption>{{ caption }}</template>
  </MediaColumn>
</template>

<style lang="scss" scoped>

.difference-canvas :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  background: var(--checkerboard);
}

</style>
