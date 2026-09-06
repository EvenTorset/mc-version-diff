<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const Delta = defineAsyncComponent(() => import('./Delta.vue'))
</script>

<template>
  <Suspense>
    <Delta />
    <template #fallback>
      <div class="delta-loading">
        <div class="delta-loading-spinner"></div>
      </div>
    </template>
  </Suspense>
</template>

<style lang="scss" scoped>

.delta-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
}

.delta-loading-spinner {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 3px solid rgb(from var(--color-accent) r g b / 0.2);
  border-top-color: var(--color-accent);
  animation: delta-loading-spin 700ms linear infinite;
}

@keyframes delta-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

</style>
