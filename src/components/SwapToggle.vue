<script setup lang="ts">
import { NIcon } from 'naive-ui'
import { ArrowLeft24Filled, ArrowRight16Filled, ArrowRight24Filled } from '@vicons/fluent'

defineProps<{
  swapped?: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <button type="button" class="swap-toggle" @click="$emit('click')">
    <NIcon :component="ArrowRight16Filled" :size="32" class="swap-icon arrow" />
    <div class="swap-icon swap">
      <div class="swap-row">
        <Transition :name="swapped ? 'flow-right' : 'flow-left'">
          <NIcon :key="String(swapped)" :component="swapped ? ArrowLeft24Filled : ArrowRight24Filled" :size="24" class="swap-arrow" :class="swapped ? 'points-left' : 'points-right'" />
        </Transition>
      </div>
      <div class="swap-row">
        <Transition :name="swapped ? 'flow-left' : 'flow-right'">
          <NIcon :key="String(swapped)" :component="swapped ? ArrowRight24Filled : ArrowLeft24Filled" :size="24" class="swap-arrow" :class="swapped ? 'points-right' : 'points-left'" />
        </Transition>
      </div>
    </div>
  </button>
</template>

<style lang="scss" scoped>

.swap-toggle {
  position: relative;
  min-width: 32px;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: none;
  align-self: center;
  cursor: pointer;
  user-select: none;
  color: var(--color-4);
  transition: color 200ms;

  &:hover,
  &.swapping {
    color: var(--color-accent);

    .arrow {
      opacity: 0;
      transform: rotate(90deg);
    }

    .swap {
      opacity: 1;
      transform: rotate(0deg);
    }
  }
}

.swap-icon {
  position: absolute;
  inset: 0;
  display: block;
  transition: opacity 300ms, transform 300ms;
}

.arrow {
  transform: rotate(0deg);
}

.swap {
  opacity: 0;
  transform: rotate(-90deg);
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.swap-row {
  position: relative;
  height: 14px;
}

.swap-arrow {
  position: absolute;
  top: 50%;
  margin-top: -12px;
  transition: opacity 300ms, transform 300ms;

  &.points-right {
    right: 0;
  }

  &.points-left {
    left: 0;
  }
}

.flow-right-leave-to {
  opacity: 0;
  transform: translateX(60%) scale(0.5);
}

.flow-left-leave-to {
  opacity: 0;
  transform: translateX(-60%) scale(0.5);
}

.flow-left-enter-from {
  opacity: 0;
  transform: translateX(60%) scale(0.5);
}

.flow-right-enter-from {
  opacity: 0;
  transform: translateX(-60%) scale(0.5);
}

</style>
