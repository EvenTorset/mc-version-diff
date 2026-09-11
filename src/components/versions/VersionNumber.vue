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

const parts = computed(() => processedId.value.value.split(/(\s+(?:to|→)\s+)/))
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
  <span v-else class="version-number">
    <template v-for="(part, i) of parts" :key="i">
      <span v-if="i % 2">{{ part }}</span>
      <span v-else class="unbroken">{{ part }}</span>
    </template>
  </span>
</template>

<style lang="scss" scoped>

.version-number {
  text-wrap: balance;
}

.unbroken {
  white-space: nowrap;
}

</style>
