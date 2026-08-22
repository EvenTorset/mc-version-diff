<script setup lang="ts">
import { ref, onMounted, Teleport, type HTMLAttributes } from 'vue'

defineOptions({ inheritAttrs: false })
defineProps</* @vue-ignore */ HTMLAttributes>()

const templateRef = ref<HTMLTemplateElement | null>(null)
const fragmentTarget = ref<DocumentFragment | null>(null)

onMounted(() => {
  if (templateRef.value) {
    fragmentTarget.value = templateRef.value.content
  }
})
</script>

<template>
  <component :is="'template'" ref="templateRef" v-bind="$attrs" />
  <Teleport v-if="fragmentTarget" :to="fragmentTarget">
    <slot></slot>
  </Teleport>
</template>
