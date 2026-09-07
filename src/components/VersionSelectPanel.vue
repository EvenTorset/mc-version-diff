<script setup lang="ts">
import { NCard } from 'naive-ui'
import Col from './Col.vue'

defineProps<{
  title?: string
  mode: 'popover' | 'menu'
}>()
</script>

<template>
  <NCard class="panel" :class="mode" :title="title">
    <template v-if="$slots.tabs" #header-extra>
      <slot name="tabs"></slot>
    </template>
    <Col align="stretch" class="panel-body">
      <div v-if="$slots.filter" class="panel-filter">
        <slot name="filter"></slot>
      </div>
      <div class="panel-list">
        <slot></slot>
      </div>
    </Col>
  </NCard>
</template>

<style lang="scss" scoped>

.panel {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-height: 0;
}

.panel.menu {
  height: 100%;
  max-height: 100%;
}

.panel :deep(.n-card-content) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0 !important;
}

.panel.popover :deep(.n-card-header) {
  flex-wrap: wrap;
  column-gap: 8px;

  .n-card-header__main {
    flex: 0 0 auto;
    min-width: auto;
    white-space: nowrap;
  }

  .n-card-header__extra {
    flex: 1 0 auto;
    display: flex;
  }

  .mode-group,
  .n-radio-group {
    flex: 1;
    display: flex;
  }

  .n-radio-button {
    flex: 1;
  }
}

.panel-body {
  flex: 1;
  min-height: 0;
}

.panel-filter {
  flex: none;
  margin: 0 4px 4px;
}

.panel-list {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

</style>
