<script setup lang="ts">
import { NProgress } from 'naive-ui'

defineProps<{
  percentage: number
  old?: number
}>()

// a floor so near-zero chances still show a sliver of bar
function floored(pct: number) {
  return Math.max(pct, 1.5)
}
</script>

<template>
  <div class="meter">
    <NProgress
      v-if="old !== undefined"
      type="line"
      :percentage="floored(old)"
      :show-indicator="false"
      :height="6"
      :border-radius="3"
      :fill-border-radius="3"
      rail-color="var(--color-2)"
      color="var(--color-3)"
    />
    <NProgress
      type="line"
      :percentage="floored(percentage)"
      :show-indicator="false"
      :height="6"
      :border-radius="3"
      :fill-border-radius="3"
      rail-color="var(--color-2)"
    />
  </div>
</template>

<style lang="scss" scoped>

.meter {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  width: 80px;
}

</style>
