<script setup lang="ts" generic="T extends string">
import RadioGroup from './RadioGroup.vue'
import RadioButton from './RadioButton.vue'

defineProps<{
  options: { value: T, label: string }[]
}>()

const value = defineModel<T>({ required: true })
</script>

<template>
  <div class="mode-group">
    <RadioGroup v-model="value" dim-unselected>
      <RadioButton v-for="option of options" :key="option.value" :value="option.value">
        {{ option.label }}
      </RadioButton>
    </RadioGroup>
  </div>
</template>

<style lang="scss" scoped>

.mode-group {
  display: flex;

  :deep(.radio-button) {
    height: 20px;
    padding: 0 8px;
    font-size: 12px;
    font-weight: 600;
    line-height: 20px;
  }
}

</style>
