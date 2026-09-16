<script setup lang="ts">
import { ref } from 'vue'
import { NDropdown, type DropdownOption } from 'naive-ui'

defineProps<{
  options: DropdownOption[]
}>()

const emit = defineEmits<{
  select: [key: string | number]
}>()

const open = ref(false)
const x = ref(0)
const y = ref(0)
const layer = ref<HTMLElement>()

function show(event: MouseEvent) {
  x.value = event.clientX
  y.value = event.clientY
  open.value = true
  window.addEventListener('scroll', () => open.value = false, { once: true, capture: true, passive: true })
}

function select(key: string | number) {
  open.value = false
  emit('select', key)
}

defineExpose({ show })
</script>

<template>
  <Teleport to="body">
    <div ref="layer" class="menu-layer"></div>
  </Teleport>
  <NDropdown
    trigger="manual"
    placement="bottom-start"
    :to="layer ?? 'body'"
    :show="open"
    :x="x"
    :y="y"
    :options="options"
    @select="select"
    @clickoutside="open = false"
  >
    <span style="display: none;"></span>
  </NDropdown>
</template>

<style lang="scss" scoped>

.menu-layer {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2000;
}

</style>
