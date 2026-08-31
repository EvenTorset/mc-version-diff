<script lang="ts">
export type AdjacentDelta = { a: string, b: string } | null
</script>

<script setup lang="ts">
import { NIcon } from 'naive-ui'
import { ArrowLeft16Filled, ArrowRight16Filled } from '@vicons/fluent'
import Dim from './Dim.vue'

defineProps<{
  provider: string
  prev: AdjacentDelta
  next: AdjacentDelta
}>()
</script>

<template>
  <div v-if="prev || next" class="section">
    <h3>Nearby comparisons</h3>
    <div class="nearby">
      <RouterLink
        v-if="prev"
        class="nearby-card"
        :to="{ name: 'delta', params: { provider, a: prev.a, b: prev.b } }"
      >
        <NIcon :component="ArrowLeft16Filled" />
        <div>
          <Dim>Previous</Dim>
          <div class="nearby-pair">{{ prev.a }} &rarr; {{ prev.b }}</div>
        </div>
      </RouterLink>
      <RouterLink
        v-if="next"
        class="nearby-card next"
        :to="{ name: 'delta', params: { provider, a: next.a, b: next.b } }"
      >
        <div>
          <Dim>Next</Dim>
          <div class="nearby-pair">{{ next.a }} &rarr; {{ next.b }}</div>
        </div>
        <NIcon :component="ArrowRight16Filled" />
      </RouterLink>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/util/gradients.scss' as gradients;

.section {
  display: flex;
  flex-direction: column;
  gap: 12px;

  h3 {
    margin: 0;
  }
}

.nearby {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.nearby-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--color-2);
  border-radius: 6px;
  text-decoration: none;
  color: var(--color-5);
  user-select: none;

  @include gradients.interactive-surface;
  transition:
    --intr-gradient-start_internal 100ms,
    --intr-gradient-end_internal 100ms,
    color 200ms;

  &:hover {
    --intr-color: rgb(from var(--color-accent) r g b / calc(alpha * 0.5));
    color: var(--color-6);
  }

  &.next {
    justify-content: flex-end;
    text-align: right;
    grid-column: 2;
  }
}

.nearby-pair {
  font-size: 14px;
}

</style>
