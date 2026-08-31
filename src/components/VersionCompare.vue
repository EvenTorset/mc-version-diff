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
import { ArrowDownload16Filled, ArrowRight24Regular, ArrowSwap24Regular } from '@vicons/fluent'
import Dim from './Dim.vue'
import Tooltip from './Tooltip.vue'
import Row from './Row.vue'
import Spacer from './Spacer.vue'

withDefaults(defineProps<{
  sides: CompareSide[]
  between?: string[]
  swappable?: boolean
}>(), {
  between: () => [],
  swappable: false,
})

defineEmits<{
  swap: []
}>()
</script>

<template>
  <div class="compare">
    <NCard v-for="(side, i) of sides" :key="i" class="version-card" size="small">
      <slot name="picker" :index="i"></slot>

      <div v-if="side.facts.length > 0" class="facts">
        <Row v-for="fact of side.facts" :key="fact.label" class="fact">
          <Tooltip :disabled="!fact.tip">
            <template #trigger="{ props: tip }"><Dim v-bind="tip" class="label">{{ fact.label }}</Dim></template>
            <h3>{{ fact.label }}</h3>
            <p>{{ fact.tip }}</p>
          </Tooltip>
          <Spacer bridge />
          <Tooltip v-if="fact.time">
            <template #trigger="{ props: tip }">
              <span v-bind="tip">
                <NTime :time="fact.time" :to="Date.now()" type="relative" />
              </span>
            </template>
            <NTime :time="fact.time" />
          </Tooltip>
          <span v-else>{{ fact.value }}</span>
        </Row>
      </div>

      <div v-if="side.downloads.length > 0" class="downloads">
        <NButton
          v-for="download of side.downloads"
          size="small"
          tag="a"
          :key="download.label"
          :href="download.url"
          rel="noreferrer"
          download
        >
          <template #icon><NIcon :component="ArrowDownload16Filled" /></template>
          {{ download.label }}
        </NButton>
      </div>
    </NCard>

    <div class="compare-arrow">
      <Tooltip v-if="swappable">
        <template #trigger="{ props: tip }">
          <button v-bind="tip" type="button" class="swap" @click="$emit('swap')">
            <NIcon :size="32" :component="ArrowRight24Regular" class="direction" />
            <NIcon :size="32" :component="ArrowSwap24Regular" class="reverse" />
          </button>
        </template>
        Swap sides
      </Tooltip>
      <NIcon v-else :size="24" :component="ArrowRight24Regular" />
      <Dim v-for="line of between" :key="line" class="apart">{{ line }}</Dim>
    </div>
  </div>
</template>

<style lang="scss" scoped>

.compare {
  display: grid;
  grid-template-columns: 340px 1fr 340px;
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
    flex: 1;
  }
}

.swap {
  display: grid;
  padding: 4px;
  border: none;
  background: none;
  color: var(--color-5);
  cursor: pointer;
  user-select: none;
  transition: color 200ms;

  > * {
    grid-area: 1 / 1;
    transition: opacity 300ms, transform 300ms;
  }

  .direction {
    transform: rotate(0deg);
  }

  .reverse {
    opacity: 0;
    transform: rotate(-90deg);
  }

  &:hover {
    color: var(--color-accent);

    .direction {
      opacity: 0;
      transform: rotate(90deg);
    }

    .reverse {
      opacity: 1;
      transform: rotate(0deg);
    }
  }
}

.compare-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  align-self: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
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
