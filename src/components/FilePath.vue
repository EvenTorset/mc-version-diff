<script setup lang="ts">
import type { ComputedRef } from 'vue'
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { matchRanges } from '@/util/path.ts'
import Dim from './Dim.vue'
import Tooltip from './Tooltip.vue'

const props = defineProps<{
  path: string
}>()

const highlight = inject<ComputedRef<string | RegExp | null> | null>('path-highlight', null)

const lastSlash = computed(() => props.path.lastIndexOf('/'))
const lastDot = computed(() => props.path.lastIndexOf('.'))

const parts = computed(() => {
  const path = props.path
  const dirEnd = lastSlash.value + 1
  const extStart = lastDot.value > dirEnd ? lastDot.value : path.length
  const ranges = matchRanges(path, highlight?.value ?? null)

  const points = new Set([0, dirEnd, extStart, path.length])
  for (const [start, end] of ranges) {
    points.add(start)
    points.add(end)
  }
  const bounds = [...points].sort((a, b) => a - b)

  const out: { text: string, dim: boolean, mark: boolean }[] = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i]
    const end = bounds[i + 1]
    if (start === end) continue
    out.push({
      text: path.slice(start, end),
      dim: end <= dirEnd || start >= extStart,
      mark: ranges.some(([from, to]) => start >= from && end <= to),
    })
  }
  return out
})

const pathEl = ref<HTMLElement>()
const isOverflowing = ref(false)

function checkOverflow() {
  if (!pathEl.value) return
  isOverflowing.value = pathEl.value.scrollWidth > pathEl.value.clientWidth
}

let observer: ResizeObserver | undefined

onMounted(() => {
  checkOverflow()
  observer = new ResizeObserver(checkOverflow)
  if (pathEl.value) observer.observe(pathEl.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <Tooltip
    anchor="pin-x"
    :disabled="!isOverflowing"
    :style="{
      '--easy-tooltip-max-width': 'calc(100dvw - 40px)',
    }"
  >
    <template #trigger="{ props }">
      <span ref="pathEl" v-bind="props" class="file-path">
        <template v-for="(part, i) of parts" :key="i">
          <mark v-if="part.mark">
            <Dim v-if="part.dim">{{ part.text }}</Dim>
            <template v-else>{{ part.text }}</template>
          </mark>
          <Dim v-else-if="part.dim">{{ part.text }}</Dim>
          <span v-else>{{ part.text }}</span>
        </template><span class="lrm">&lrm;</span>
      </span>
    </template>
    {{ path }}
  </Tooltip>
</template>

<style lang="css" scoped>

.file-path {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  min-width: 32px;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
  font-weight: 500;
  font-size: 15px;

  & .lrm {
    user-select: none;
  }

  & mark {
    color: inherit;
    --color-dim: var(--color-5);
    border-radius: 3px;
    background-color: rgb(from var(--color-accent) r g b / 0.33);
    padding: 0 2px;
    margin: 0 -2px;
  }

  & mark:has(+ mark) {
    padding-right: 0;
    margin-right: 0;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  & mark + mark {
    padding-left: 0;
    margin-left: 0;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
}

</style>
