<script setup lang="ts" generic="T">
import { inject, computed, type Component } from 'vue'

const props = withDefaults(defineProps<{
  value: T
  is?: Component | string
}>(), {
  is: 'div',
})

const group = inject<{
  nullable: boolean
  dimUnselected: boolean
  selectedValue: { value: T | null }
  selectValue: (val: T) => void
  isSelected: (val: T) => boolean
}>('radio-group')

const isSelected = computed(() => group?.isSelected(props.value) ?? false)

const handleClick = () => {
  group?.selectValue(props.value)
}
</script>

<template>
  <component
    :is
    class="radio-button"
    :class="{
      selected: isSelected,
      dim: group?.dimUnselected && !isSelected && group?.selectedValue.value !== null,
    }"
    @click="handleClick"
  >
    <slot></slot>
  </component>
</template>

<style lang="scss" scoped>
@use '@/util/gradients.scss' as gradients;

.radio-button {
  position: relative;
  user-select: none;
  cursor: pointer;
  z-index: 1;

  @include gradients.interactive-surface(30% 100%);
  transition:
    --intr-gradient-start_internal 200ms,
    --intr-gradient-end_internal 200ms,
    --intr-gradient-size 300ms,
    --intr-gradient-x 200ms,
    --intr-gradient-y 200ms,
    box-shadow 200ms,
    text-shadow 200ms,
    background-color 200ms,
    color 200ms;
  border-radius: 6px;
  color: var(--color-5);

  &.dim {
    color: var(--color-dim);
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    transition: border-color 200ms;
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
      --intr-color: oklch(from var(--color-accent) l calc(c * 1.3) h / 0.6);
      --intr-gradient-start: var(--intr-color);
      --intr-gradient-end-alpha: 0.15;
      --intr-gradient-size: 100% 100%;
      background-color: transparent !important;

      &::after {
        border-color: rgb(from var(--intr-color) calc(1.2 * r) calc(1.2 * g) calc(1.2 * b) / 0.2);
      }
    }
  }
}

</style>
