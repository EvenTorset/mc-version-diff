<script setup lang="ts">
import { Settings } from '@/settings'
import { reactive } from 'vue'
import MarkChanges from './MarkChanges.vue'

const props = defineProps<{
  original: Record<string, string>
  modified: Record<string, string>
}>()

const changes = reactive({
  added: [] as [string, string][],
  edited: [] as [string, string, string][],
  removed: [] as [string, string][],
})
for (const [ k, v ] of Object.entries(props.original)) {
  if (!(k in props.modified)) {
    changes.removed.push([k, v])
  } else if (v !== props.modified[k]) {
    changes.edited.push([k, v, props.modified[k]])
  }
}
for (const [ k, v ] of Object.entries(props.modified)) {
  if (!(k in props.original)) {
    changes.added.push([k, v])
  }
}
</script>

<template>
  <div v-if="changes.added.length > 0" class="section added">
    <h3 style='margin-left: 12px;'>New Localization Strings</h3>
    <div class='grid-table' style="grid-template-columns: auto 1fr; font-weight: 500;">
      <div class='grid-table-row grid-table-header'>
        <div style='padding-left: 12px;'>Key</div>
        <div style='padding-right: 12px;'>Value</div>
      </div>
      <div class='grid-table-row' v-for="[k, v] of changes.added">
        <div class="key" style='padding-left: 12px;'><code>{{ k }}</code></div>
        <div :style="{
          paddingRight: '12px',
          whiteSpace: 'pre-wrap',
          fontFamily: Settings.pixelFont ? 'var(--pixel-font-family)' : undefined,
          fontSize: Settings.pixelFont ? '20px' : undefined
        }">{{ v }}</div>
      </div>
    </div>
  </div>
  <div v-if="changes.edited.length > 0" class="section edited">
    <h3 style='margin-left: 12px;'>Updated Localization Strings</h3>
    <div class='grid-table' style="grid-template-columns: auto 1fr; font-weight: 500;">
      <div class='grid-table-row grid-table-header'>
        <div style='padding-left: 12px;'>Key</div>
        <div style='padding-right: 12px;'>Value</div>
      </div>
      <div class='grid-table-row' v-for="[k, o, m] of changes.edited">
        <div class="key" style='padding-left: 12px;'><code>{{ k }}</code></div>
        <div :style="{
          paddingRight: '12px',
          paddingTop: '4px',
          paddingBottom: '4px',
          whiteSpace: 'pre-wrap',
          fontFamily: Settings.pixelFont ? 'var(--pixel-font-family)' : undefined,
          fontSize: Settings.pixelFont ? '20px' : undefined
        }"><MarkChanges :original="o" :modified="m"/></div>
      </div>
    </div>
  </div>
  <div v-if="changes.removed.length > 0" class="section removed">
    <h3 style='margin-left: 12px;'>Removed Localization Strings</h3>
    <div class='grid-table' style="grid-template-columns: auto 1fr; font-weight: 500;">
      <div class='grid-table-row grid-table-header'>
        <div style='padding-left: 12px;'>Key</div>
        <div style='padding-right: 12px;'>Value</div>
      </div>
      <div class='grid-table-row' v-for="[k, v] of changes.removed">
        <div class="key" style='padding-left: 12px;'><code>{{ k }}</code></div>
        <div :style="{
          paddingRight: '12px',
          whiteSpace: 'pre-wrap',
          fontFamily: Settings.pixelFont ? 'var(--pixel-font-family)' : undefined,
          fontSize: Settings.pixelFont ? '20px' : undefined
        }">{{ v }}</div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>

.section {
  padding: 8px 0 20px;

  &.added {
    --key-color: var(--color-success);
  }

  &.edited {
    --key-color: var(--color-accent-suppl);
  }

  &.removed {
    --key-color: var(--color-danger);
  }

  .key {
    color: var(--key-color);
  }
}

</style>
