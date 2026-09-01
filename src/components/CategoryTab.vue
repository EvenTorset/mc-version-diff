<script setup lang="ts">
import { NIcon } from 'naive-ui'
import { Star12Filled, Star12Regular, Triangle12Regular } from '@vicons/fluent'
import Tooltip from './Tooltip.vue'
import { useRoute } from 'vue-router'
import { Settings } from '@/settings'
import { computed } from 'vue'

defineProps<{
  count: number
  name: string
  selected: boolean
}>()

const route = useRoute()
const provider = computed(() => route.params.provider as string)
const favorite = computed({
  get() {
    return Settings.favoriteCategory[provider.value] ?? 'Overview'
  },
  set(value) {
    Settings.favoriteCategory[provider.value] = value
  },
})
</script>

<template>
  <div class="category-tab" :class="{ selected }">
    <NIcon
      v-if="name === 'Overview'"
      class="category-tab-count"
      :component="Triangle12Regular"
      :size="17"
      style="margin-bottom: -1px;"
    />
    <div v-else class="category-tab-count">{{ count }}</div>
    <div class="category-tab-name">{{ name }}</div>
    <Tooltip>
      <template #trigger="{ props }">
        <NIcon
          v-bind="props"
          class="favorite-button"
          @click.stop="favorite = name"
          :component="favorite === name ? Star12Filled : Star12Regular"
        />
      </template>
      <h3>Favorite Category</h3>
      <p>Your favorite category will be opened automatically when opening a new diff.</p>
    </Tooltip>
  </div>
</template>

<style lang="scss" scoped>
@use '@/util/gradients.scss' as gradients;

.category-tab-count {
  color: var(--color-accent);
  text-align: right;
  justify-self: end;
  font-weight: 600;
  transition: color .15s ease-out;
  line-height: 1;
  white-space: nowrap;
  width: max-content;
  padding-left: 8px;
  font-family: var(--monospace-font-family);
}

.category-tab-name {
  font-size: 16px;
  transition: color .15s ease-out;
  line-height: 1;
}

.favorite-button {
  opacity: 0;
  transition: opacity 200ms;
  color: var(--color-6);
  z-index: 1;
  padding: 4px;
  margin: -4px;

  &:hover {
    color: var(--color-7);
  }
}

.category-tab {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  align-items: center;
  box-sizing: border-box;
  padding: 4px 6px;
  cursor: pointer;
  user-select: none;

  --intr-color: transparent;
  --intr-color-fade: color-mix(
    in oklch,
    var(--intr-color),
    oklch(from var(--intr-color) l calc(max(c, 0.2) * 2) var(--hue-cold))
  );
  --intr-gradient-start: rgb(from var(--intr-color) r g b / calc(alpha * 0.75));
  --intr-gradient-end-alpha: 0.1;
  --intr-gradient-end: rgb(from var(--intr-color-fade) r g b / calc(alpha * var(--intr-gradient-end-alpha)));
  --intr-gradient-size: 30% 50%;
  --intr-gradient-x: 110%;
  --intr-gradient-y: 50%;
  --intr-gradient-start_internal: var(--intr-gradient-start);
  --intr-gradient-end_internal: var(--intr-gradient-end);
  background-color: transparent;
  background-image: radial-gradient(
    var(--intr-gradient-size) at var(--intr-gradient-x) var(--intr-gradient-y) in oklch,
    gradients.scrim(var(--intr-gradient-start_internal), var(--intr-gradient-end_internal))
  );
  background-repeat: no-repeat;
  transition:
    --intr-gradient-start_internal 200ms,
    --intr-gradient-end_internal 200ms,
    --intr-gradient-size 750ms,
    --intr-gradient-x 200ms,
    --intr-gradient-y 200ms,
    box-shadow 200ms,
    text-shadow 200ms,
    color 200ms;
  border-radius: 6px;
  color: var(--color-5);
  position: relative;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    transition: border-color 200ms;
  }

  &:hover {
    --intr-color: oklch(from var(--color-accent) l calc(c * 1.3) h / 0.6);
    --intr-gradient-start: var(--intr-color);
    --intr-gradient-end-alpha: 0.15;
    --intr-gradient-size: 80% 150%;
    color: var(--color-6);
    text-shadow: 0 1px 2px #000;

    &::after {
      border-color: rgb(from var(--intr-color) calc(1.2 * r) calc(1.2 * g) calc(1.2 * b) / 0.2);
    }

    .category-tab-count {
      color: oklch(from var(--color-accent) calc(l * 1.2) c h);
    }

    .favorite-button {
      opacity: 1;
    }
  }

  &.selected {
    --intr-color: oklch(from var(--color-accent) l calc(c * 1.3) h);
    --intr-gradient-start: var(--intr-color);
    --intr-gradient-end-alpha: 0.15;
    --intr-gradient-size: 80% 150%;
    color: var(--color-6);
    background-color: rgb(from var(--color-0) r g b / 1) !important;
    text-shadow: 0 1px 2px #000;
    box-shadow: 0 0 8px rgb(from var(--intr-color) calc(1.2 * r) calc(1.2 * g) calc(1.2 * b) / 0.333);

    &::after {
      border-color: rgb(from var(--intr-color) calc(1.2 * r) calc(1.2 * g) calc(1.2 * b) / 0.3);
    }

    .category-tab-count {
      color: oklch(from var(--color-accent) calc(l * 1.2) c h);
    }

    &:hover {
      color: var(--color-7);
      --intr-gradient-size: 100% 180%;
      --intr-gradient-end-alpha: 0.25;

      &::after {
        border-color: rgb(from var(--color-accent) r g b / 0.6);
      }

      .category-tab-count {
        color: oklch(from var(--color-accent) calc(l * 1.4) calc(c * 2) h);
      }
    }
  }
}

</style>
