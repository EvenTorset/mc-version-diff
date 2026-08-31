<script setup lang="ts" generic="T extends string">
import { NRadioButton, NRadioGroup } from 'naive-ui'

defineProps<{
  options: { value: T, label: string }[]
}>()

const value = defineModel<T>({ required: true })
</script>

<template>
  <div class="mode-group">
    <NRadioGroup v-model:value="value" size="small">
      <NRadioButton v-for="option of options" :key="option.value" :value="option.value">
        {{ option.label }}
      </NRadioButton>
    </NRadioGroup>
  </div>
</template>

<style lang="scss" scoped>

.mode-group {
  display: flex;
  white-space: nowrap;
  border: 1px solid var(--color-2);
  border-radius: 3px;
  overflow: hidden;

  :deep(.n-radio-button) {
    height: 20px;
    padding: 0 8px;
    font-size: 12px;
    line-height: 20px;
    color: var(--color-4);
    background: transparent;
    border: none;
    border-radius: 0;
    text-align: center;
    user-select: none;

    &:hover {
      color: var(--color-5);
    }
  }

  :deep(.n-radio-button--checked) {
    background: var(--color-accent);
    color: var(--color-6);
  }

  :deep(.n-radio-button__state-border) {
    display: none;
  }

  :deep(.n-radio-group__splitor) {
    width: 1px;
    height: auto;
    align-self: stretch;
    background: var(--color-2);
  }
}

</style>
