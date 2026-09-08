<script setup lang="ts">
import type { DeltaTrackStateName } from '@/delta_providers/states.ts'
import Col from './Col.vue'
import RadioButton from './RadioButton.vue'

const props = defineProps<{
  name: DeltaTrackStateName
  count: number
  value: DeltaTrackStateName
}>()
</script>

<template>
  <RadioButton
    v-if="count > 0"
    :is="Col"
    class="wrapper"
    :value
  >
    <div class="count">{{ count }}</div>
    <div class="label">{{ name }}</div>
  </RadioButton>
</template>

<style lang="scss" scoped>

.wrapper {
  flex: 1;
  padding: 8px 0;
  line-height: 1.1;
}

.count {
  font-size: 1.2em;
}

.label {
  font-size: 10px;
  font-weight: 600;
}

</style>
