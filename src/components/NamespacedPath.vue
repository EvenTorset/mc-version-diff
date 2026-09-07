<script setup lang="ts">
import { computed } from 'vue'
import Dim from './Dim.vue'

const props = defineProps<{
  value: string
}>()

const namespace = computed(() => {
  const ci = props.value.indexOf(':')
  if (ci >= 0) {
    return props.value.slice(0, ci + 1)
  }
  return 'minecraft:'
})

const path = computed(() => {
  const ci = props.value.indexOf(':')
  if (ci >= 0) {
    return props.value.slice(ci + 1)
  }
  return props.value
})
</script>

<template>
  <span style="font-family: var(--monospace-font-family);">
    <Dim>{{ namespace }}</Dim>
    <span>{{ path }}</span>
  </span>
</template>
