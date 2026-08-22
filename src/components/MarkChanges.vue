<script setup lang="tsx">
import type { ComponentOrStaticRenderableContent, Renderable } from '@/types'
import Content from '@/components/Content.vue'
import Row from './Row.vue'

defineProps<{
  original: string
  modified: string
  code?: boolean
}>()

function markChanges(original: string, modified: string): Renderable {
  const tokenize = (text: string): string[] => text.match(/\w+|[^\w\s]+|\s+/g) || []

  const origTokens = tokenize(original)
  const modTokens = tokenize(modified)

  const m = origTokens.length
  const n = modTokens.length

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origTokens[i - 1] === modTokens[j - 1]) {
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
    if (origTokens[i - 1] === modTokens[j - 1]) {
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
        let canBridge = true;
        for (let gap = lastMarked + 1; gap < k; gap++) {
          if (/\w/.test(modTokens[gap])) {
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

  const nodes: ComponentOrStaticRenderableContent[] = []
  let buffer = ''
  let markKey = 0

  const flushBuffer = () => {
    if (!buffer) return;

    if (/^\s+$/.test(buffer)) {
      nodes.push(<mark key={markKey++}>{buffer}</mark>)
      buffer = ''
      return;
    }

    const leadingSpace = buffer.match(/^\s*/)?.[0] || ''
    const trailingSpace = buffer.match(/\s*$/)?.[0] || ''
    const coreContent = buffer.substring(
      leadingSpace.length,
      buffer.length - trailingSpace.length
    )

    if (leadingSpace) {
      nodes.push(leadingSpace)
    }
    if (coreContent) {
      nodes.push(<mark key={markKey++}>{coreContent}</mark>)
    }
    if (trailingSpace) {
      nodes.push(trailingSpace)
    }

    buffer = ''
  }

  for (let k = 0; k < n; k++) {
    if (isMarked[k]) {
      buffer += modTokens[k]
    } else {
      flushBuffer()
      nodes.push(modTokens[k])
    }
  }
  flushBuffer()

  return nodes
}
</script>

<template>
  <Row class="line original" gap="6px">
    <div class="prefix" :style="{
      fontSize: '14px',
      fontFamily: 'var(--font-family)',
    }">Before:</div>
    <div class="content">
      <code v-if="code">
        <Content :content="() => markChanges(modified, original)"/>
      </code>
      <Content v-else :content="() => markChanges(modified, original)"/>
    </div>
  </Row>
  <Row class="line modified" gap="6px">
    <div class="prefix" :style="{
      fontSize: '14px',
      fontFamily: 'var(--font-family)',
    }">After:</div>
    <div class="content">
      <code v-if="code">
        <Content :content="() => markChanges(original, modified)"/>
      </code>
      <Content v-else :content="() => markChanges(original, modified)"/>
    </div>
  </Row>
</template>

<style lang="css" scoped>

.line {
  &>.prefix {
    min-width: 60px;
    max-width: 60px;
    text-align: right;
    color: var(--color-4);
    user-select: none;
    pointer-events: none;
  }

  &>.content {
    flex: 1;

    &>:deep(mark) {
      color: var(--color-6);
      position: relative;
      border-radius: 3px;
      background-color: var(--background);
      padding: 0 2px;
      margin: 0 -2px;
    }
  }
}

.original>.content>:deep(mark) {
  --background: rgb(from var(--color-danger) r g b / 0.33);
}

.modified>.content>:deep(mark) {
  --background: rgb(from var(--color-success) r g b / 0.33);
}

</style>
