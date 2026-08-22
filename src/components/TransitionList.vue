<script setup lang="ts" generic="T extends Record<string, any>">
type KeyField<T> = keyof T | ((item: T) => string | number | symbol)

const props = withDefaults(
  defineProps<{
    items: T[]
    keyField?: KeyField<T>
    tag?: string
    name?: string
  }>(),
  {
    keyField: 'id' as keyof T,
    tag: 'div',
    name: 'transition-list',
  }
)

function getItemKey(item: T): string | number | symbol {
  if (typeof props.keyField === 'function') {
    return props.keyField(item)
  }

  return item[props.keyField as keyof T]
}
</script>

<template>
  <TransitionGroup :name="name" :tag="tag" class="transition-list-container">
    <div
      v-for="item in items"
      :key="getItemKey(item)"
      class="transition-list-item"
    >
      <slot :item="item" />
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
