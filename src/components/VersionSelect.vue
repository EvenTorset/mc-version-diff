<script setup lang="ts">
import { NButton, NIcon, NInput, NPopover, type InputInst } from 'naive-ui'
import { ChevronDown16Filled, Eraser20Filled } from '@vicons/fluent'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Tooltip from './Tooltip.vue'
import VersionSelectPanel from './VersionSelectPanel.vue'

const props = withDefaults(defineProps<{
  mode?: 'popover' | 'menu'
  title?: string
  label?: string
  placeholder?: string
  maxHeight?: string
}>(), {
  mode: 'popover',
  placeholder: 'Filter...',
  maxHeight: '340px',
})

const open = defineModel<boolean>('open', { default: false })
const filter = defineModel<string>('filter', { default: '' })

const input = ref<InputInst | null>(null)

const REFOCUS_WINDOW = 500
let blurredAt = 0

function show() {
  open.value = true
}

function hide() {
  open.value = false
  input.value?.blur()
}

function onTriggerMousedown(event: MouseEvent) {
  if (!open.value) return
  event.preventDefault()
  hide()
}

function onBlur() {
  blurredAt = performance.now()
}

function itemSelected() {
  if (props.mode === 'popover') {
    hide()
    return
  }
  const stillFocused = input.value?.inputElRef === document.activeElement
  if (stillFocused || performance.now() - blurredAt < REFOCUS_WINDOW) {
    nextTick(() => input.value?.focus())
  }
}

watch(open, value => {
  if (props.mode !== 'popover') return
  if (value) {
    nextTick(() => input.value?.focus())
  } else {
    filter.value = ''
  }
})

function onKeydown(event: KeyboardEvent) {
  if (
    (event.ctrlKey || event.metaKey)
    && event.key.toLowerCase() === 'f'
    && input.value?.inputElRef !== document.activeElement
  ) {
    event.preventDefault()
    input.value?.select()
  }
}

onMounted(() => {
  if (props.mode === 'menu') window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

defineExpose({ hide, itemSelected })
</script>

<template>
  <VersionSelectPanel v-if="mode === 'menu'" mode="menu" :title="title">
    <template #tabs><slot name="tabs"></slot></template>
    <template #filter>
      <NInput
        ref="input"
        clearable
        :placeholder="placeholder"
        v-model:value="filter"
        @blur="onBlur"
      >
        <template #clear-icon>
          <Tooltip>
            <template #trigger="{ props: tip }">
              <NButton v-bind="tip" class="icon" circle size="small">
                <template #icon>
                  <Eraser20Filled />
                </template>
              </NButton>
            </template>
            Clear
          </Tooltip>
        </template>
      </NInput>
    </template>
    <slot></slot>
  </VersionSelectPanel>

  <NPopover
    v-else
    :show="open"
    trigger="manual"
    placement="bottom-start"
    width="trigger"
    class="version-select-popover"
    :show-arrow="false"
    @clickoutside="hide"
  >
    <template #trigger>
      <NInput
        ref="input"
        class="version-select-trigger"
        :class="{ open }"
        :value="open ? filter : label"
        :placeholder="open ? label ?? placeholder : placeholder"
        @update:value="value => filter = value"
        @focus="show"
        @mousedown="onTriggerMousedown"
        @keydown.escape="hide"
      >
        <template #suffix>
          <NIcon :component="ChevronDown16Filled" class="chevron" />
        </template>
      </NInput>
    </template>
    <div class="version-select-panel" :style="{ maxHeight }">
      <VersionSelectPanel mode="popover" :title="title">
        <template #tabs><slot name="tabs"></slot></template>
        <slot></slot>
      </VersionSelectPanel>
    </div>
  </NPopover>
</template>

<style lang="scss" scoped>

.version-select-trigger {
  cursor: pointer;

  :deep(input) {
    cursor: pointer;
  }

  &.open :deep(input) {
    cursor: text;
  }

  :deep(.n-input__suffix) {
    margin-right: 0 !important;
    margin-left: 8px;
  }
}

.chevron {
  font-size: 16px;
  color: var(--color-4);
  transition: transform 150ms, color 150ms;
}

.version-select-trigger:hover .chevron {
  color: var(--color-5);
}

.version-select-trigger.open .chevron {
  transform: rotate(180deg);
}

.version-select-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-radius: 6px;
}

</style>

<style lang="scss">

.version-select-popover {
  padding: 0 !important;

  .n-card {
    background-color: transparent !important;
    border: none !important;
  }
}

.n-popover.version-select-popover .n-list {
  --n-merged-color: var(--n-color);
  --n-merged-color-hover: var(--n-color-hover);
  --n-merged-border-color: var(--n-border-color);
}

.n-popover.version-select-popover {
  &.popover-transition-enter-from,
  &.popover-transition-leave-to {
    opacity: 0;
    transform: translateY(12px);
  }

  &.popover-transition-enter-to,
  &.popover-transition-leave-from {
    opacity: 1;
    transform: translateY(0);
  }

  &.popover-transition-enter-active {
    transition: opacity 0.2s ease-out, transform 0.2s ease-out;
  }

  &.popover-transition-leave-active {
    transition: opacity 0.2s cubic-bezier(1, 0.5, 0.8, 1), transform 0.2s cubic-bezier(1, 0.5, 0.8, 1);
  }
}

</style>
