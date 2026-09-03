<script setup lang="ts">
import { DeltaTrackState } from '@/delta_providers/states'
import { maxWidthQuery, useBreakpoint } from '@/util/useBreakpoint'
import { Add16Filled, Delete16Filled, Edit16Filled, Location16Filled } from '@vicons/fluent'
import { computed, mergeProps } from 'vue'
import Tooltip from './Tooltip.vue'

const props = defineProps<{
  state: DeltaTrackState
  fullWidth?: boolean
}>()

const isNarrow = useBreakpoint(maxWidthQuery('1100px'))

const config = computed(() => ({
  [DeltaTrackState.Added]: {
    text: 'Added',
    icon: Add16Filled,
    color: 'var(--color-success)',
  },
  [DeltaTrackState.Edited]: {
    text: 'Edited',
    icon: Edit16Filled,
    color: 'var(--color-accent)',
    borderAlpha: 0.7,
  },
  [DeltaTrackState.Moved]: {
    text: 'Moved',
    icon: Location16Filled,
    color: 'var(--color-5)',
  },
  [DeltaTrackState.Removed]: {
    text: 'Removed',
    icon: Delete16Filled,
    color: 'var(--color-danger)',
  },
}[props.state]))
</script>

<template>
  <div
    v-if="fullWidth || !isNarrow"
    class="track-tag"
    :style="{
      '--tag-color': config.color,
      '--tag-border-alpha': config.borderAlpha ?? 0.4,
    }"
  >{{ config.text }}</div>
  <Tooltip v-else>
    <template #trigger="{ props }">
      <div
        v-bind="mergeProps(props, $attrs)"
        class="track-tag narrow"
        :style="{
          '--tag-color': config.color,
          '--tag-border-alpha': config.borderAlpha ?? 0.4,
        }"
      >
        <component :is="config.icon" />
      </div>
    </template>
    {{ config.text }}
  </Tooltip>
</template>

<style>

.track-tag {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 80px;
  max-width: 80px;
  height: 22px;
  box-sizing: border-box;
  border-radius: 11px;
  font-size: 12px;
  font-weight: 600;
  line-height: 12px;
  white-space: nowrap;
  user-select: none;
  background-color: rgb(from var(--tag-color) r g b / 0.25);
  border: 1px solid rgb(from var(--tag-color) r g b / var(--tag-border-alpha));
  color: oklch(from var(--tag-color) calc(l * 1.3) calc(c * 0.7) h);
  cursor: pointer;

  &.narrow {
    min-width: 28px;
    max-width: 28px;
    height: 28px;
    border-radius: 14px;
    margin-left: -6px;

    &>svg {
      width: 20px;
      height: 20px;
    }
  }
}

</style>
