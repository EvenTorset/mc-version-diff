<script setup lang="ts">
defineProps<{
  color: string
  borderAlpha?: number
}>()
</script>

<template>
  <span class="track-tag" :style="{
    '--tag-color': color,
    '--tag-border-alpha': borderAlpha ?? 0.4,
  }"><slot></slot></span>
</template>

<style>

.track-tag {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 80px;
  max-width: 80px;
  height: 22px;
  box-sizing: border-box;
  border-radius: 11px;
  font-size: 12px;
  font-weight: 600;
  line-height: 12px;
  white-space: nowrap;
  user-select: none;
  background-color: rgb(from var(--tag-color) r g b / 0.25);
  border: 1px solid rgb(from var(--tag-color) r g b / var(--tag-border-alpha));
  color: oklch(from var(--tag-color) calc(l * 1.3) calc(c * 0.7) h);
  cursor: pointer;
}

</style>
