<script setup lang="tsx">
import type { ComponentOrStaticRenderableContent, Renderable } from '@/types'
import type { ComputedRef } from 'vue'
import { inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { matchRanges } from '@/util/path.ts'
import Content from '@/components/Content.vue'
import Dim from './Dim.vue'
import Tooltip from './Tooltip.vue'

const props = defineProps<{
  original: string
  modified: string
  code?: boolean
}>()

const highlight = inject<ComputedRef<string | RegExp | null> | null>('path-highlight', null)

function renderPathSlice(
  path: string,
  start: number,
  end: number,
  hits: [number, number][],
): ComponentOrStaticRenderableContent[] {
  if (start >= end) return []

  const lastSlash = path.lastIndexOf('/')
  const lastDot = path.lastIndexOf('.')
  const dirEnd = lastSlash + 1
  const extStart = lastDot > dirEnd ? lastDot : path.length

  const points = new Set([start, end])
  for (const point of [dirEnd, extStart]) {
    if (point > start && point < end) points.add(point)
  }
  for (const [from, to] of hits) {
    if (from > start && from < end) points.add(from)
    if (to > start && to < end) points.add(to)
  }
  const bounds = [...points].sort((a, b) => a - b)

  const sliceNodes: ComponentOrStaticRenderableContent[] = []

  for (let i = 0; i < bounds.length - 1; i++) {
    const from = bounds[i]
    const to = bounds[i + 1]
    if (from === to) continue

    const text = path.slice(from, to)
    const node = to <= dirEnd || from >= extStart ? <Dim>{text}</Dim> : text

    if (hits.some(([hitFrom, hitTo]) => from >= hitFrom && to <= hitTo)) {
      sliceNodes.push(<span class="search-hit">{node}</span>)
    } else {
      sliceNodes.push(node)
    }
  }

  sliceNodes.push(<span class="lrm">&lrm;</span>)
  return sliceNodes
}

function markPathChanges(fromPath: string, toPath: string): Renderable {
  const hits = matchRanges(toPath, highlight?.value ?? null)
  const tokenize = (text: string): string[] => text.match(/[a-zA-Z0-9]+|[^a-zA-Z0-9\s]+|\s+/g) || []

  const origTokens = tokenize(fromPath)
  const targetTokens = tokenize(toPath)

  const m = origTokens.length
  const n = targetTokens.length

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origTokens[i - 1] === targetTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const isMarked: boolean[] = new Array(n).fill(false)
  let i = m
  let j = n

  while (i > 0 && j > 0) {
    if (origTokens[i - 1] === targetTokens[j - 1]) {
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      isMarked[j - 1] = true
      j--
    }
  }

  while (j > 0) {
    isMarked[j - 1] = true
    j--
  }

  let lastMarked = -1

  for (let k = 0; k < n; k++) {
    if (isMarked[k]) {
      if (lastMarked !== -1 && lastMarked < k - 1) {
        let canBridge = true
        for (let gap = lastMarked + 1; gap < k; gap++) {
          if (/\w/.test(targetTokens[gap])) {
            canBridge = false
            break
          }
        }

        if (canBridge) {
          for (let gap = lastMarked + 1; gap < k; gap++) {
            isMarked[gap] = true
          }
        }
      }
      lastMarked = k
    }
  }

  const tokenRanges: Array<{ start: number; end: number }> = []
  let currentOffset = 0
  for (let k = 0; k < n; k++) {
    const len = targetTokens[k].length
    tokenRanges.push({ start: currentOffset, end: currentOffset + len })
    currentOffset += len
  }

  const nodes: ComponentOrStaticRenderableContent[] = []
  let buffer = ''
  let bufferStart = -1
  let bufferEnd = -1
  let markKey = 0

  const flushBuffer = () => {
    if (!buffer) return;

    if (/^\s+$/.test(buffer)) {
      nodes.push(
        <mark key={markKey++}>
          {renderPathSlice(toPath, bufferStart, bufferEnd, hits)}
        </mark>
      )
      buffer = ''
      return;
    }

    const leadingSpace = buffer.match(/^\s*/)?.[0] || ''
    const trailingSpace = buffer.match(/\s*$/)?.[0] || ''
    const coreContent = buffer.substring(
      leadingSpace.length,
      buffer.length - trailingSpace.length
    )

    const leadingEnd = bufferStart + leadingSpace.length
    const coreEnd = leadingEnd + coreContent.length

    if (leadingSpace) {
      nodes.push(...renderPathSlice(toPath, bufferStart, leadingEnd, hits))
    }
    if (coreContent) {
      nodes.push(
        <mark key={markKey++}>
          {renderPathSlice(toPath, leadingEnd, coreEnd, hits)}
        </mark>
      )
    }
    if (trailingSpace) {
      nodes.push(...renderPathSlice(toPath, coreEnd, bufferEnd, hits))
    }

    buffer = ''
  }

  for (let k = 0; k < n; k++) {
    if (isMarked[k]) {
      if (!buffer) {
        bufferStart = tokenRanges[k].start
      }
      buffer += targetTokens[k]
      bufferEnd = tokenRanges[k].end
    } else {
      flushBuffer()
      nodes.push(...renderPathSlice(toPath, tokenRanges[k].start, tokenRanges[k].end, hits))
    }
  }
  flushBuffer()

  return nodes
}

const originalEl = ref<HTMLElement>()
const modifiedEl = ref<HTMLElement>()
const originalOverflowing = ref(false)
const modifiedOverflowing = ref(false)

function checkOverflow(el: HTMLElement | undefined, target: typeof originalOverflowing) {
  if (!el) return
  target.value = el.scrollWidth > el.clientWidth
}

let observer: ResizeObserver | undefined

onMounted(() => {
  checkOverflow(originalEl.value, originalOverflowing)
  checkOverflow(modifiedEl.value, modifiedOverflowing)

  observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target === originalEl.value) checkOverflow(originalEl.value, originalOverflowing)
      if (entry.target === modifiedEl.value) checkOverflow(modifiedEl.value, modifiedOverflowing)
    }
  })
  if (originalEl.value) observer.observe(originalEl.value)
  if (modifiedEl.value) observer.observe(modifiedEl.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
})

watch(() => [props.original, props.modified], () => {
  nextTickCheck()
})

function nextTickCheck() {
  requestAnimationFrame(() => {
    checkOverflow(originalEl.value, originalOverflowing)
    checkOverflow(modifiedEl.value, modifiedOverflowing)
  })
}
</script>

<template>
  <div class="line original">
    <div class="content">
      <Tooltip :disabled="!originalOverflowing">
        <template #trigger="{ props: tooltipProps }">
          <span ref="originalEl" v-bind="tooltipProps" class="file-path">
            <Content :content="() => markPathChanges(modified, original)" />
          </span>
        </template>
        {{ original }}
      </Tooltip>
    </div>
  </div>
  <div class="line modified">
    <div class="content">
      <Tooltip :disabled="!modifiedOverflowing">
        <template #trigger="{ props: tooltipProps }">
          <span ref="modifiedEl" v-bind="tooltipProps" class="file-path">
            <Content :content="() => markPathChanges(original, modified)" />
          </span>
        </template>
        {{ modified }}
      </Tooltip>
    </div>
  </div>
</template>

<style lang="css" scoped>

.line {
  display: flex;

  &>.content {
    flex: 1;
    min-width: 0;
  }
}

.file-path {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  min-width: 0;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
  font-weight: 500;
  font-size: 15px;
  display: block;

  & :deep(.lrm) {
    user-select: none;
  }

  & :deep(.search-hit) {
    color: var(--color-6);
    --color-dim: var(--color-5);
    border-radius: 3px;
    background-color: rgb(from var(--color-accent) r g b / 0.4);
    padding: 0 2px;
    margin: 0 -2px;
  }

  & :deep(:is(mark, .search-hit):has(+ :is(mark, .search-hit))),
  & :deep(:is(mark, .search-hit):has(+ .lrm + :is(mark, .search-hit))),
  & :deep(mark > .search-hit:last-child),
  & :deep(mark > .search-hit:has(+ .lrm:last-child)) {
    padding-right: 0;
    margin-right: 0;
  }

  & :deep(:is(mark, .search-hit) + :is(mark, .search-hit)),
  & :deep(:is(mark, .search-hit) + .lrm + :is(mark, .search-hit)),
  & :deep(mark > .search-hit:first-child) {
    padding-left: 0;
    margin-left: 0;
  }

  & :deep(.search-hit:has(+ :is(mark, .search-hit))),
  & :deep(.search-hit:has(+ .lrm + :is(mark, .search-hit))),
  & :deep(mark > .search-hit:last-child),
  & :deep(mark > .search-hit:has(+ .lrm:last-child)),
  & :deep(mark:has(+ mark)),
  & :deep(mark:has(+ .lrm + mark)) {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  & :deep(:is(mark, .search-hit) + .search-hit),
  & :deep(:is(mark, .search-hit) + .lrm + .search-hit),
  & :deep(mark + mark),
  & :deep(mark + .lrm + mark),
  & :deep(mark > .search-hit:first-child) {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  & :deep(mark) {
    color: var(--color-6);
    --color-dim: var(--color-5);
    position: relative;
    border-radius: 3px;
    background-color: var(--background);
    padding: 0 2px;
    margin: 0 -2px;
  }
}

.original :deep(mark) {
  --background: rgb(from var(--color-danger) r g b / 0.33);
}

.modified :deep(mark) {
  --background: rgb(from var(--color-success) r g b / 0.33);
}

</style>
