<script lang="ts">
export type AdjacentDelta = { a: string, b: string } | null

export type NearbyGroup = {
  label?: string
  prev: AdjacentDelta
  next: AdjacentDelta
}

export type NearbyLink = {
  label: string
  a: string
  b: string
}
</script>

<script setup lang="ts">
import { NIcon } from 'naive-ui'
import { ArrowLeft16Filled, ArrowRight16Filled } from '@vicons/fluent'
import Dim from './Dim.vue'

withDefaults(defineProps<{
  provider: string
  groups: NearbyGroup[]
  links?: NearbyLink[]
}>(), {
  links: () => [],
})

function suffix(label?: string) {
  return label ? ` ${label}` : ''
}
</script>

<template>
  <div v-if="groups.length > 0 || links.length > 0" class="section">
    <h3>Related</h3>
    <div class="nearby">
      <div v-for="group of groups" :key="group.label ?? ''" class="nearby-row">
        <RouterLink
          v-if="group.prev"
          class="nearby-card"
          :to="{ name: 'delta', params: { provider, a: group.prev.a, b: group.prev.b } }"
        >
          <NIcon :component="ArrowLeft16Filled" />
          <div>
            <Dim>Previous{{ suffix(group.label) }}</Dim>
            <div class="nearby-pair">{{ group.prev.a }} &rarr; {{ group.prev.b }}</div>
          </div>
        </RouterLink>
        <RouterLink
          v-if="group.next"
          class="nearby-card next"
          :to="{ name: 'delta', params: { provider, a: group.next.a, b: group.next.b } }"
        >
          <div>
            <Dim>Next{{ suffix(group.label) }}</Dim>
            <div class="nearby-pair">{{ group.next.a }} &rarr; {{ group.next.b }}</div>
          </div>
          <NIcon :component="ArrowRight16Filled" />
        </RouterLink>
      </div>

      <RouterLink
        v-for="link of links"
        :key="link.label"
        class="nearby-card full"
        :to="{ name: 'delta', params: { provider, a: link.a, b: link.b } }"
      >
        <div>
          <Dim>{{ link.label }}</Dim>
          <div class="nearby-pair">{{ link.a }} &rarr; {{ link.b }}</div>
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
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nearby-row {
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

  &.full {
    justify-content: space-between;
  }
}

.nearby-pair {
  font-size: 14px;
}

</style>
