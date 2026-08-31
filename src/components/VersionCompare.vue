<script lang="ts">
export type CompareFact = {
  label: string
  tip?: string
  value?: string
  time?: Date
}

export type CompareDownload = {
  label: string
  url: string
}

export type CompareSide = {
  facts: CompareFact[]
  downloads: CompareDownload[]
}
</script>

<script setup lang="ts">
import { NButton, NCard, NIcon, NTime } from 'naive-ui'
import { ArrowDownload16Filled, ArrowRight24Regular } from '@vicons/fluent'
import Dim from './Dim.vue'
import Tooltip from './Tooltip.vue'

withDefaults(defineProps<{
  sides: CompareSide[]
  between?: string[]
}>(), {
  between: () => [],
})
</script>

<template>
  <div class="compare">
    <NCard v-for="(side, i) of sides" :key="i" class="version-card" size="small">
      <slot name="picker" :index="i"></slot>

      <div v-if="side.facts.length > 0" class="facts">
        <div v-for="fact of side.facts" :key="fact.label" class="fact">
          <Tooltip :disabled="!fact.tip">
            <template #trigger="{ props: tip }"><Dim v-bind="tip" class="label">{{ fact.label }}</Dim></template>
            {{ fact.tip }}
          </Tooltip>
          <Tooltip v-if="fact.time">
            <template #trigger="{ props: tip }">
              <span v-bind="tip">
                <NTime :time="fact.time" :to="Date.now()" type="relative" />
              </span>
            </template>
            <NTime :time="fact.time" />
          </Tooltip>
          <span v-else>{{ fact.value }}</span>
        </div>
      </div>

      <div v-if="side.downloads.length > 0" class="downloads">
        <a
          v-for="download of side.downloads"
          :key="download.label"
          :href="download.url"
          rel="noreferrer"
          download
        >
          <NButton size="small" secondary>
            <template #icon><NIcon :component="ArrowDownload16Filled" /></template>
            {{ download.label }}
          </NButton>
        </a>
      </div>
    </NCard>

    <div class="compare-arrow">
      <NIcon :size="24" :component="ArrowRight24Regular" />
      <Dim v-for="line of between" :key="line" class="apart">{{ line }}</Dim>
    </div>
  </div>
</template>

<style lang="scss" scoped>

.compare {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: start;
  gap: 20px;
}

.version-card:nth-of-type(1) { grid-column: 1; grid-row: 1; }
.version-card:nth-of-type(2) { grid-column: 3; grid-row: 1; }
.compare-arrow { grid-column: 2; grid-row: 1; }

.version-card :deep(.n-card-content) {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.facts {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fact {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
}

.fact .label {
  cursor: help;
  text-decoration: underline dotted rgb(from var(--color-4) r g b / 0.5);
  text-underline-offset: 3px;
}

.downloads {
  display: flex;
  gap: 8px;

  a {
    text-decoration: none;
  }
}

.compare-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  align-self: center;
  gap: 4px;
  font-size: 12px;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .compare {
    grid-template-columns: 1fr;
  }

  .version-card:nth-of-type(1) { grid-column: 1; grid-row: 1; }
  .compare-arrow { grid-column: 1; grid-row: 2; }
  .version-card:nth-of-type(2) { grid-column: 1; grid-row: 3; }

  .compare-arrow {
    flex-direction: row;
  }
}

</style>
