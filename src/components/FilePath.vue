<script setup lang="ts">
import { computed } from 'vue'
import Dim from './Dim.vue'
import Tooltip from './Tooltip.vue'

const props = defineProps<{
  path: string
}>()

const lastSlash = computed(() => props.path.lastIndexOf('/'))
const lastDot = computed(() => props.path.lastIndexOf('.'))

const directory = computed(() => props.path.slice(0, lastSlash.value + 1))
const name = computed(() =>
  props.path.slice(lastSlash.value + 1, lastDot.value > lastSlash.value ? lastDot.value : undefined),
)
const extension = computed(() =>
  lastDot.value > lastSlash.value ? props.path.slice(lastDot.value) : '',
)
</script>

<template>
  <Tooltip :style="{
    '--easy-tooltip-max-width': 'auto',
  }">
    <template #trigger="{ props }">
      <span v-bind="props" class="file-path">
        <Dim>{{ directory }}</Dim>
        <span>{{ name }}</span>
        <Dim>{{ extension }}</Dim>
      </span>
    </template>
    {{ path }}
  </Tooltip>
</template>

<style lang="css" scoped>

.file-path {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  min-width: 0;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
  font-weight: 500;
  font-size: 15px;
}

</style>
