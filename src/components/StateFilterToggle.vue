<script setup lang="ts">
import type { DeltaTrackStateName } from '@/delta_providers/states.ts'
import Col from './Col.vue'
import { computed } from 'vue'

const props = defineProps<{
  name: DeltaTrackStateName
  count: number
}>()

const value = defineModel<DeltaTrackStateName | null>('modelValue')

const selected = computed(() => props.name === value.value)
const dim = computed(() => props.name !== value.value && value.value !== null)
</script>

<template>
  <Col
    v-if="count > 0"
    class="wrapper"
    :class="{ selected, dim }"
    @click="value = selected ? null : name"
  >
    <div class="count">{{ count }}</div>
    <div class="label">{{ name }}</div>
  </Col>
</template>

<style lang="scss" scoped>
@use '@/util/gradients.scss' as gradients;

.wrapper {
  position: relative;
  flex: 1;
  padding: 8px 0;
  user-select: none;
  cursor: pointer;
  color: var(--color-5);
  line-height: 1.1;
  transition: color 150ms;
  z-index: 1;

  @include gradients.interactive-surface(30% 100%);
  transition:
    --intr-gradient-start_internal 200ms,
    --intr-gradient-end_internal 200ms,
    --intr-gradient-size 750ms,
    --intr-gradient-x 200ms,
    --intr-gradient-y 200ms,
    box-shadow 200ms,
    text-shadow 200ms,
    color 200ms;
  border-radius: 6px;
  color: var(--color-5);

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    transition: border-color 200ms;
  }

  &.dim {
    color: var(--color-4);
  }

  &:hover {
    --intr-color: oklch(from var(--color-accent) l calc(c * 1.3) h / 0.6);
    --intr-gradient-start: var(--intr-color);
    --intr-gradient-end-alpha: 0.15;
    --intr-gradient-size: 100% 100%;
    color: var(--color-6);
    text-shadow: 0 1px 2px #000;

    &::after {
      border-color: rgb(from var(--intr-color) calc(1.2 * r) calc(1.2 * g) calc(1.2 * b) / 0.2);
    }
  }

  &.selected {
    --intr-color: oklch(from var(--color-accent) l calc(c * 1.3) h);
    --intr-gradient-start: var(--intr-color);
    --intr-gradient-end-alpha: 0.15;
    --intr-gradient-size: 100% 100%;
    color: var(--color-6);
    background-color: rgb(from var(--color-0) r g b / 1) !important;
    text-shadow: 0 1px 2px #000;
    box-shadow: 0 0 8px rgb(from var(--intr-color) calc(1.2 * r) calc(1.2 * g) calc(1.2 * b) / 0.333);

    &::after {
      border-color: rgb(from var(--intr-color) calc(1.2 * r) calc(1.2 * g) calc(1.2 * b) / 0.3);
    }

    &:hover {
      --intr-gradient-size: 100% 110%;
      --intr-gradient-end-alpha: 0.25;
      color: var(--color-7);

      &::after {
        border-color: rgb(from var(--color-accent) r g b / 0.6);
      }
    }
  }
}

.count {
  font-size: 1.2em;
}

.label {
  font-size: 10px;
  font-weight: 600;
}

</style>
