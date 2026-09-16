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
  url?: string
  icon?: Component
  download?: boolean
}

export type CompareSide = {
  key?: string
  facts: CompareFact[]
  links: CompareLink[]
}
</script>

<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { NButton, NCard, NIcon, NSkeleton, NTime } from 'naive-ui'
import { ArrowRight24Regular } from '@vicons/fluent'
import Dim from './Dim.vue'
import Tooltip from './Tooltip.vue'
import Row from './Row.vue'
import Spacer from './Spacer.vue'
import SwapToggle from './SwapToggle.vue'
import ContextMenu from './ContextMenu.vue'

const flipped = ref(false)

const downloads = (side: CompareSide) => side.links.filter(link => link.download)
const pending = (links: CompareLink[]) => links.some(link => !link.url)

const jarMenu = ref<InstanceType<typeof ContextMenu>>()
const jarSide = ref<CompareSide>()
const jarOptions = computed(() => downloads(jarSide.value ?? { facts: [], links: [] }).filter(link => link.url).map(link => ({
  label: link.label,
  key: link.url!,
  icon: () => h(NIcon, { component: link.icon }),
})))

function openJars(side: CompareSide, event: MouseEvent) {
  jarSide.value = side
  jarMenu.value?.show(event)
}

function download(url: string | number) {
  const link = document.createElement('a')
  link.href = String(url)
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
    <NCard v-for="(side, i) of sides" :key="side.key ?? i" class="version-card" size="small">
      <slot name="picker" :index="i"></slot>

      <TransitionGroup v-if="side.facts.length > 0" name="reveal" tag="div" class="facts">
        <div v-for="fact of side.facts" :key="fact.label" class="fact-slot reveal-slot">
          <Row class="fact">
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
            <span v-else-if="fact.value !== undefined">{{ fact.value }}</span>
            <NSkeleton v-else text width="72px" height="14px" :sharp="false" />
          </Row>
        </div>
      </TransitionGroup>

      <TransitionGroup v-if="side.links.length > 0" name="reveal" tag="div" class="links">
        <div v-if="downloads(side).length > 0" key="download" class="link-slot reveal-slot">
          <NSkeleton v-if="pending(downloads(side))" height="28px" :sharp="false" />
          <NButton v-else size="small" @click="openJars(side, $event)">
            <template #icon><NIcon :component="downloads(side)[0].icon" /></template>
            Download jar
          </NButton>
        </div>
        <div v-for="link of side.links.filter(link => !link.download)" :key="link.label" class="link-slot reveal-slot">
          <NSkeleton v-if="!link.url" height="28px" :sharp="false" />
          <NButton
            v-else
            size="small"
            tag="a"
            :href="link.url"
            rel="noreferrer"
            target="_blank"
          >
            <template #icon><NIcon :component="link.icon" /></template>
            {{ link.label }}
          </NButton>
        </div>
      </TransitionGroup>
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
    <ContextMenu ref="jarMenu" :options="jarOptions" @select="download" />
  </div>
</template>

<style lang="scss" scoped>

.compare {
  display: grid;
  grid-template-columns: minmax(0, 340px) auto minmax(0, 340px);
  align-items: center;
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
}

.fact-slot + .fact-slot {
  padding-top: 4px;

  &.reveal-enter-from,
  &.reveal-leave-to {
    padding-top: 0;
  }
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

  a {
    text-decoration: none;
  }
}

.link-slot {
  flex: 1;
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
