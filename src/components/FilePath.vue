<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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

const pathEl = ref<HTMLElement>()
const isOverflowing = ref(false)

function checkOverflow() {
  if (!pathEl.value) return
  isOverflowing.value = pathEl.value.scrollWidth > pathEl.value.clientWidth
}

let observer: ResizeObserver | undefined

onMounted(() => {
  checkOverflow()
  observer = new ResizeObserver(checkOverflow)
  if (pathEl.value) observer.observe(pathEl.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <Tooltip
    anchor="pin-x"
    :disabled="!isOverflowing"
    :style="{
      '--easy-tooltip-max-width': 'calc(100dvw - 40px)',
    }"
  >
    <template #trigger="{ props }">
      <span ref="pathEl" v-bind="props" class="file-path">
        <Dim>{{ directory }}</Dim>
        <span>{{ name }}</span>
        <Dim>{{ extension }}</Dim>&lrm;
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
