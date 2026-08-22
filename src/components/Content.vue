<script setup lang="ts">
import type { Renderable } from '@/types'
import Bitmap from '@/components/Bitmap.vue'

const props = defineProps<{
  content: Renderable
}>()

function isBitmap() {
  return props.content instanceof ImageBitmap
}
</script>

<template>
  <template v-if="Array.isArray(content)">
    <Content v-for="part in content" :content="part" />
  </template>
  <Bitmap v-else-if="isBitmap()" :bitmap="(content as ImageBitmap)"/>
  <template v-else-if="typeof content === 'string'">{{ content }}</template>
  <component v-else :is="content" />
</template>
