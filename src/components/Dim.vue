<script setup lang="ts">
withDefaults(defineProps<{
  tag?: string
}>(), {
  tag: 'span'
})
</script>

<template>
  <component :is="tag" class="dim">
    <slot></slot>
  </component>
</template>

<style lang="scss" scoped>

.dim {
  color: var(--color-dim) !important;
}

</style>
