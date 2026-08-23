<script setup lang="ts">
import type { TooltipSide } from '@/types'
import type { TooltipEvent } from 'easy-tooltips'
import { computed, type CSSProperties } from 'vue'

const props = defineProps<{
  side?: TooltipSide
  distance?: number
  disable?: boolean
  style?: CSSProperties
}>()
defineEmits<{
  'tooltip-open': [event: TooltipEvent]
  'tooltip-close': [event: TooltipEvent]
  'tooltip-move': [event: TooltipEvent]
}>()

function cssPropertiesToString(styleObj: CSSProperties): string {
  return Object.entries(styleObj)
    .filter(([_, value]) => value != null && value !== '')
    .map(([key, value]) =>
      `${key.replace(/([A-Z])/g, '-$1').toLowerCase()}:${value};`
    )
    .join(' ')
}

const styleString = computed(() => cssPropertiesToString(props.style ?? {}))
</script>

<template>
  <slot
    name="trigger"
    :props="disable ? {} : {
      'data-easy-tooltip-src': 'next',
      'data-easy-tooltip-class': 'tooltip',
      'data-easy-tooltip-prefer': side,
      onEasyTooltipOpen: (e: TooltipEvent) => $emit('tooltip-open', e),
      onEasyTooltipClose: (e: TooltipEvent) => $emit('tooltip-close', e),
      onEasyTooltipMove: (e: TooltipEvent) => $emit('tooltip-move', e),
      ...typeof distance === 'number' ? {
        'data-easy-tooltip-style': `--easy-tooltip-distance: ${distance}px;${styleString}`,
      } : {
        'data-easy-tooltip-style': props.style ? `${styleString}` : undefined,
      },
    }"
  ></slot>
  <template>
    <slot></slot>
  </template>
</template>
