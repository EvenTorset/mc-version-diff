<script setup lang="ts">
import Col from './Col.vue'

defineProps<{
  title?: string
}>()
</script>

<template>
  <Col gap="0">
    <div class="media-label">{{ title }}</div>
    <slot></slot>
    <div v-if="$slots.caption" class="media-label"><slot name="caption"></slot></div>
  </Col>
</template>

<style lang="scss" scoped>

.media-label {
  padding: 0 4px;
  font-size: 12px;
  font-weight: 700;
  min-height: 1lh;

  :deep(.new) {
    color: var(--color-success);

    :root.light-color-scheme & {
      color: color-mix(in srgb, var(--color-success) 75%, var(--color-5));
    }
  }

  :deep(.old) {
    color: var(--color-danger);

    :root.light-color-scheme & {
      color: color-mix(in srgb, var(--color-danger) 75%, var(--color-5));
    }
  }
}

</style>
