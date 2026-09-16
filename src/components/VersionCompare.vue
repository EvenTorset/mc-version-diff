<script lang="ts">
import type { Component } from 'vue'
import Content from './Content.vue'
import type { Renderable } from '@/types.ts'

export type CompareFact = {
  label: string
  tip?: string
  value?: string
  time?: Date
}

export type CompareLink = {
  label: string
  url: string
  icon: Component
  download?: boolean
}

export type CompareSide = {
  facts: CompareFact[]
  links: CompareLink[]
}
</script>

<script setup lang="ts">
import { h, ref } from 'vue'
import { NButton, NCard, NDropdown, NIcon, NTime } from 'naive-ui'
import { ArrowRight24Regular } from '@vicons/fluent'
import Dim from './Dim.vue'
import Tooltip from './Tooltip.vue'
import Row from './Row.vue'
import Spacer from './Spacer.vue'
import SwapToggle from './SwapToggle.vue'

const flipped = ref(false)

const downloads = (side: CompareSide) => side.links.filter(link => link.download)

function download(url: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = ''
  link.rel = 'noreferrer'
  link.click()
}

withDefaults(defineProps<{
  sides: CompareSide[]
  between?: Renderable[]
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
  <div class="compare" :class="{ single: sides.length < 2 }">
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

      <div v-if="side.links.length > 0" class="links">
        <NDropdown
          v-if="downloads(side).length > 0"
          trigger="click"
          placement="bottom"
          :options="downloads(side).map(link => ({ label: link.label, key: link.url, icon: () => h(NIcon, { component: link.icon }) }))"
          @select="download"
        >
          <NButton size="small">
            <template #icon><NIcon :component="downloads(side)[0].icon" /></template>
            Download jar
          </NButton>
        </NDropdown>
        <NButton
          v-for="link of side.links.filter(link => !link.download)"
          size="small"
          tag="a"
          :key="link.label"
          :href="link.url"
          rel="noreferrer"
          :download="link.download"
          :target="!link.download ? '_blank' : undefined"
        >
          <template #icon><NIcon :component="link.icon" /></template>
          {{ link.label }}
        </NButton>
      </div>
    </NCard>

    <div v-if="sides.length > 1" class="compare-arrow">
      <Tooltip v-if="swappable">
        <template #trigger="{ props: tip }">
          <SwapToggle v-bind="tip" :swapped="flipped" @click="flipped = !flipped; $emit('swap')" />
        </template>
        Swap sides
      </Tooltip>
      <NIcon v-else :size="32" :component="ArrowRight24Regular" style="padding: 4px;" />
      <template v-for="line of between">
        <Dim v-if="typeof line === 'string'" :key="line" class="apart">{{ line }}</Dim>
        <Content v-else :content="line" />
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>

.compare {
  display: grid;
  grid-template-columns: minmax(0, 340px) auto minmax(0, 340px);
  align-items: start;
  gap: 20px;
}

.version-card:nth-of-type(1) { grid-column: 1; grid-row: 1; }
.version-card:nth-of-type(2) { grid-column: 3; grid-row: 1; }
.compare-arrow { grid-column: 2; grid-row: 1; }

.compare.single {
  grid-template-columns: 340px;
  justify-content: center;
}

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

.links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  > * {
    flex: 1;
  }

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
