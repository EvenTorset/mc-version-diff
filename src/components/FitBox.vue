<script setup lang="ts">
import { computed, useSlots, cloneVNode, type VNode } from 'vue'

const props = defineProps<{
  maxWidth: number
  maxHeight: number
  width: number
  height: number
}>()

const scale = computed(() =>
  Math.min(
    props.maxWidth / props.width,
    props.maxHeight / props.height
  )
)

const slots = useSlots()

const child = computed(() => {
  const defaultSlot = slots.default?.()
  if (!defaultSlot || defaultSlot.length !== 1) {
    throw new Error('Invalid FitBox content. FitBox must contain exactly one element.')
  }
  const vnode = defaultSlot?.[0] as VNode

  return cloneVNode(vnode, {
    style: {
      ...(vnode.props?.style as object),
      width: `${props.width * scale.value}px`,
      height: `${props.height * scale.value}px`,
    },
  })
})
</script>

<template>
  <component :is="child" />
</template>
