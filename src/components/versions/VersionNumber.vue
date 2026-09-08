<script setup lang="ts">
import { computed } from 'vue'
import Tooltip from '@/components/Tooltip.vue'

const props = defineProps<{
  id: string
}>()

const processedId = computed(() => {
  const processed =  props.id
    // .replace(/^(.+-snap)shot(-\d+)$/, '$1$2')
  return {
    value: processed,
    changed: processed !== props.id,
  }
})
</script>

<template>
  <template v-if="processedId.changed">
    <Tooltip :keep-alive-on-hover="false">
      <template #trigger="props">
        <span v-bind="props">{{ processedId.value }}</span>
      </template>
      {{ props.id }}
    </Tooltip>
  </template>
  <span v-else>{{ processedId.value }}</span>
</template>
