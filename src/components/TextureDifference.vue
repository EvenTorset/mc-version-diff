<script setup lang="ts">
import { createDiffer, type DiffFrame, type DiffSide } from '@/util/imageDiff'
import { frameOffset, type Playhead } from '@/util/animation'
import { popupable } from '@/util/popupable'
import { onBeforeUnmount, onMounted, ref, useSlots } from 'vue'
import FitBox from './FitBox.vue'
import MediaColumn from './MediaColumn.vue'
import NativeTemplate from './NativeTemplate.vue'

const props = defineProps<{
  sideA: DiffSide
  sideB: DiffSide
  label?: string
  group?: string
}>()

const slots = useSlots()
const containerRef = ref<HTMLDivElement>()
const size = ref({ width: 16, height: 16 })
const ready = ref(false)

const playheads: Record<'a' | 'b', Playhead | null> = { a: null, b: null }

let differ: ReturnType<typeof createDiffer> | null = null
let frame = 0

function diffFrame(side: DiffSide, playhead: Playhead | null): DiffFrame {
  const { width, height } = side.frame
  const current = frameOffset(side.image.width, side.frame, playhead?.frame ?? 0)
  if (playhead?.next === undefined || !playhead.progress) {
    return { width, height, ...current }
  }
  const next = frameOffset(side.image.width, side.frame, playhead.next)
  return { width, height, ...current, nextX: next.x, nextY: next.y, progress: playhead.progress }
}

function draw() {
  frame = 0
  differ?.draw(
    diffFrame(props.sideA, playheads.a),
    diffFrame(props.sideB, playheads.b),
  )
}

// both sides repaint in the same tick, so coalesce their updates into one draw
function requestDraw() {
  frame ||= requestAnimationFrame(draw)
}

function setPlayhead(side: 'a' | 'b', playhead: Playhead) {
  playheads[side] = playhead
  requestDraw()
}

defineExpose({ setPlayhead })

onMounted(() => {
  const width = Math.max(props.sideA.frame.width, props.sideB.frame.width)
  const height = Math.max(props.sideA.frame.height, props.sideB.frame.height)

  differ = createDiffer(width, height)
  differ.setSources(props.sideA.image, props.sideB.image)
  size.value = { width, height }

  for (const [ attr, value ] of Object.entries(popupable({
    title: slots.popup ? undefined : props.label,
    content: slots.popup ? 'prev' : undefined,
    group: props.group,
    thumbnails: true,
    zoom: true,
  }))) {
    if (value != null) differ.canvas.setAttribute(attr, String(value))
  }
  containerRef.value?.append(differ.canvas)
  ready.value = true
  requestDraw()
})

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
      <div ref="containerRef" class="difference-canvas">
        <NativeTemplate v-if="$slots.popup"><slot name="popup" /></NativeTemplate>
      </div>
    </FitBox>
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
