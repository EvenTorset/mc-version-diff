<script setup lang="ts">
import { formatBytes } from '@/util/bytes'

defineProps<{
  diff: number
}>()
</script>

<template>
  <span :style="{
    color:
      diff < 0 ? 'color-mix(in srgb, var(--color-danger), var(--color-dim))' :
      diff > 0 ? 'color-mix(in srgb, var(--color-success), var(--color-dim))' :
      'var(--color-dim)',
    whiteSpace: 'nowrap',
    fontSize: '12px',
    fontWeight: 600,
  }">{{ diff >= 0 ? '+' : '' }}{{ formatBytes(diff) }}</span>
</template>
