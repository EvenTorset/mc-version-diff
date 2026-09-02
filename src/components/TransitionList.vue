<script setup lang="ts" generic="T extends Record<string, any>">
import type { CSSProperties } from 'vue'

type KeyField<T> = keyof T | ((item: T) => string | number | symbol)

const props = withDefaults(defineProps<{
  items: T[]
  keyField?: KeyField<T>
  tag?: string
  name?: string
  itemStyle?: string | CSSProperties
}>(), {
  keyField: 'id' as keyof T,
  tag: 'div',
  name: 'transition-list',
})

function getItemKey(item: T): string | number | symbol {
  if (typeof props.keyField === 'function') {
    return props.keyField(item)
  }

  return item[props.keyField as keyof T]
}

function onBeforeLeave(el: Element) {
  if (el instanceof HTMLElement) {
    const parent = el.parentElement
    if (parent) {
      const parentStyle = window.getComputedStyle(parent)
      const cols = parentStyle.gridTemplateColumns
      const gap = parentStyle.columnGap

      if (cols && cols !== 'none' && cols !== 'subgrid') {
        el.style.gridTemplateColumns = cols
        el.style.columnGap = gap
      }
    }

    el.style.top = `${el.offsetTop}px`
    el.style.left = `${el.offsetLeft}px`
    el.style.width = `${el.offsetWidth}px`
  }
}
</script>

<template>
  <TransitionGroup
    :name="name"
    :tag="tag"
    class="transition-list-container"
    @before-leave="onBeforeLeave"
  >
    <div
      v-for="item in items"
      :key="getItemKey(item)"
      class="transition-list-item"
      :style="itemStyle"
    >
      <slot :item="item"></slot>
    </div>
  </TransitionGroup>
</template>

<style scoped>

.transition-list-container {
  position: relative;
}

.transition-list-item {
  box-sizing: border-box;
}

.transition-list-move,
.transition-list-enter-active,
.transition-list-leave-active {
  transition: all 0.35s cubic-bezier(0.25, 1, 0.5, 1);
}

.transition-list-enter-from,
.transition-list-leave-to {
  opacity: 0;
  transform: translateY(-12px) scale(0.98);
}

.transition-list-leave-active {
  position: absolute;
  width: 100%;
}

</style>
