<script setup lang="ts">
import Dim from './Dim.vue'

defineProps<{
  text: string
}>()
</script>

<template>
  <Dim tag="div" class="section-header">{{ text }}</Dim>
</template>

<style lang="scss" scoped>

.section-header {
  margin: 0 -4px -8px;
  padding: 4px 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 22px;

  &:not(:first-child) {
    margin-top: -4px;
  }
}

</style>
