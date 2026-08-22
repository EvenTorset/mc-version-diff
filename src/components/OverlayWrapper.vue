<script setup lang="ts">
import { ref, provide } from 'vue'
import type { Renderable } from '@/types'
import Content from '@/components/Content.vue'

defineProps<{
  fit?: boolean
}>()

const buttons = ref<Renderable[]>([])

const setOverlayButtons = (newButtons: Renderable[]): void => {
  buttons.value = newButtons
}

provide('setOverlayButtons', setOverlayButtons)
</script>

<template>
  <div class="overlay-wrapper" :class="{ fit }">
    <slot></slot>
    <div v-if="buttons.length" class="overlay-buttons">
      <Content
        v-for="(button, index) in buttons"
        :key="index"
        :content="button"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>

.overlay-wrapper {
  position: relative;

  &.fit {
    width: fit-content;
    height: fit-content;
  }
}

.overlay-buttons {
  position: absolute;
  top: 2px;
  right: 2px;
  display: none;
  z-index: 10;
  border-radius: 16px;
  background-color: var(--color-1);
  border: 1px solid var(--color-2);
  gap: 2px;
  padding: 1px;
  box-shadow: 0 2px 4px #0008;
}

.overlay-wrapper:hover .overlay-buttons {
  display: flex;
}

</style>
