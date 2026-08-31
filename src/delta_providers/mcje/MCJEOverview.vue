<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NCard, NIcon, NTime } from 'naive-ui'
import {
  ArrowLeft16Filled,
  ArrowRight16Filled,
  ArrowRight24Regular,
  ArrowDownload16Filled,
} from '@vicons/fluent'
import type { DeltaResult } from '@/delta_providers'
import { DeltaTrackState } from '@/delta_providers/states'
import {
  getSurroundingDeltas,
  getVersion,
  getVersionDetails,
  type MCJEManifestVersion,
  type MCJEVersionDetails,
} from './version_manifest'
import { getPackFormats, type PackFormats } from './pack_formats'
import MCJEVersionPicker from './MCJEVersionPicker.vue'
import { formatBytes } from '@/util/bytes'
import AnimatedHeight from '@/components/AnimatedHeight.vue'
import Col from '@/components/Col.vue'
import Dim from '@/components/Dim.vue'
import Meter from '@/components/Meter.vue'
import Row from '@/components/Row.vue'
import Tooltip from '@/components/Tooltip.vue'
import TransitionList from '@/components/TransitionList.vue'
import TrackTag from '@/components/TrackTag.vue'

const props = defineProps<{
  dr: DeltaResult
}>()

const router = useRouter()
const route = useRoute()

type Side = {
  version: MCJEManifestVersion | null
  details: MCJEVersionDetails | null
  packs: PackFormats | null
}

const sideA = ref<Side>({ version: null, details: null, packs: null })
const sideB = ref<Side>({ version: null, details: null, packs: null })

type AdjacentDelta = { a: string, b: string } | null
const prev = ref<AdjacentDelta>(null)
const next = ref<AdjacentDelta>(null)

async function loadSide(id: string): Promise<Side> {
  const [ version, details ] = await Promise.all([ getVersion(id), getVersionDetails(id) ])
  return { version, details, packs: getPackFormats(id) }
}

async function load() {
  const [ a, b, around ] = await Promise.all([
    loadSide(props.dr.a),
    loadSide(props.dr.b),
    getSurroundingDeltas(props.dr.a, props.dr.b),
  ])
  sideA.value = a
  sideB.value = b
  prev.value = around.prev
  next.value = around.next
}

onMounted(load)

watch(() => [ props.dr.a, props.dr.b ], load)

function go(a: string, b: string) {
  if (a === b) return
  router.push({ name: 'delta', params: { provider: 'mcje', a, b } })
}

const stateSummary = computed(() => {
  const counts: Record<string, number> = { Added: 0, Edited: 0, Moved: 0, Removed: 0 }
  for (const track of props.dr.tracks) counts[DeltaTrackState[track.state]]++
  return [
    { name: 'Added', count: counts.Added, color: 'var(--color-success)' },
    { name: 'Edited', count: counts.Edited, color: 'var(--color-accent)', borderAlpha: 0.7 },
    { name: 'Moved', count: counts.Moved, color: 'var(--color-5)' },
    { name: 'Removed', count: counts.Removed, color: 'var(--color-danger)' },
  ]
})

const activeState = computed(() => (route.query.state as string) ?? null)

function toggleState(name: string) {
  router.replace({
    query: { ...route.query, state: activeState.value === name ? undefined : name },
  })
}

const categories = computed(() => {
  const counts = new Map<string, number>()
  for (const track of props.dr.tracks) {
    if (activeState.value && DeltaTrackState[track.state] !== activeState.value) continue
    const name = props.dr.getCategory(track)?.name ?? 'Other'
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const rows = [ ...counts ].sort((x, y) => y[1] - x[1])
  const most = rows[0]?.[1] ?? 1
  return rows.map(([ name, count ]) => ({ name, count, share: Math.round((count / most) * 100) }))
})

const TIPS: Record<string, string> = {
  type: 'Release versions are the finished updates. Snapshots are the weekly previews of the next one.',
  size: 'Download size of the client jar, which holds the code, textures, models and data.',
  assets: 'Combined size of the sounds and language files, which live outside the jar and are downloaded separately.',
  assetIndex: 'Names the list of external assets this version uses. Versions sharing an index share those files.',
  resource: 'The resource pack format this version accepts. A pack made for a different number needs updating.',
  data: 'The data pack format this version accepts. A pack made for a different number needs updating.',
  released: 'When this version was published by Mojang.',
}

function factsFor(side: Side) {
  const { version, details, packs } = side
  if (!version || !details) return []
  return [
    { label: 'Type', value: version.type, tip: TIPS.type },
    { label: 'Size', value: formatBytes(details.downloads.client.size), tip: TIPS.size },
    { label: 'Assets', value: formatBytes(details.assetIndex.totalSize), tip: TIPS.assets },
    { label: 'Asset index', value: details.assetIndex.id, tip: TIPS.assetIndex },
    ...packs?.resource ? [ { label: 'Resource pack format', value: packs.resource, tip: TIPS.resource } ] : [],
    ...packs?.data ? [ { label: 'Data pack format', value: packs.data, tip: TIPS.data } ] : [],
  ]
}

const sizeDelta = computed(() => {
  const a = sideA.value.details?.downloads.client.size
  const b = sideB.value.details?.downloads.client.size
  if (a === undefined || b === undefined) return null
  return b - a
})

const daysApart = computed(() => {
  const a = sideA.value.version?.releaseTime
  const b = sideB.value.version?.releaseTime
  if (!a || !b) return null
  const ms = Math.abs(new Date(b).valueOf() - new Date(a).valueOf())
  return Math.round(ms / 86400000)
})
</script>

<template>
  <div class="overview">
    <div class="compare">
      <NCard v-for="(side, i) of [ sideA, sideB ]" :key="i" class="version-card" size="small">
        <MCJEVersionPicker
          :model-value="i === 0 ? dr.a : dr.b"
          :disabled-versions="[ i === 0 ? dr.b : dr.a ]"
          @update:model-value="id => i === 0 ? go(id, dr.b) : go(dr.a, id)"
        />

        <div v-if="side.version && side.details" class="facts">
          <div class="fact">
            <Tooltip>
              <template #trigger="{ props: tip }"><Dim v-bind="tip" class="label">Released</Dim></template>
              {{ TIPS.released }}
            </Tooltip>
            <Tooltip>
              <template #trigger="{ props: tip }">
                <span v-bind="tip">
                  <NTime :time="new Date(side.version.releaseTime)" :to="Date.now()" type="relative" />
                </span>
              </template>
              <NTime :time="new Date(side.version.releaseTime)" />
            </Tooltip>
          </div>
          <div v-for="fact of factsFor(side)" :key="fact.label" class="fact">
            <Tooltip>
              <template #trigger="{ props: tip }"><Dim v-bind="tip" class="label">{{ fact.label }}</Dim></template>
              {{ fact.tip }}
            </Tooltip>
            <span>{{ fact.value }}</span>
          </div>
        </div>

        <div v-if="side.details" class="downloads">
          <a :href="side.details.downloads.client.url" rel="noreferrer" download>
            <NButton size="small" secondary>
              <template #icon><NIcon :component="ArrowDownload16Filled" /></template>
              Client jar
            </NButton>
          </a>
          <a
            v-if="side.details.downloads.server"
            :href="side.details.downloads.server.url"
            rel="noreferrer"
            download
          >
            <NButton size="small" secondary>
              <template #icon><NIcon :component="ArrowDownload16Filled" /></template>
              Server jar
            </NButton>
          </a>
        </div>
      </NCard>

      <div class="compare-arrow">
        <NIcon :size="24" :component="ArrowRight24Regular" />
        <Dim v-if="daysApart !== null" class="apart">
          {{ daysApart === 0 ? 'same day' : daysApart === 1 ? '1 day apart' : `${daysApart} days apart` }}
        </Dim>
        <Dim v-if="sizeDelta !== null" class="apart">
          {{ sizeDelta === 0 ? 'same size' : `${sizeDelta > 0 ? '+' : '-'}${formatBytes(Math.abs(sizeDelta))}` }}
        </Dim>
      </div>
    </div>

    <div class="section">
      <h3>What changed</h3>
      <Row class="states" gap="10px" align="stretch" wrap>
        <NCard
          v-for="state of stateSummary"
          :key="state.name"
          class="state"
          :class="{
            empty: state.count === 0,
            selected: activeState === state.name,
            dim: activeState !== null && activeState !== state.name,
          }"
          size="small"
          @click="state.count > 0 && toggleState(state.name)"
        >
          <Col>
            <div class="state-count">{{ state.count }}</div>
            <TrackTag :color="state.color" :border-alpha="state.borderAlpha">{{ state.name }}</TrackTag>
          </Col>
        </NCard>
      </Row>
    </div>

    <div v-if="categories.length > 0" class="section">
      <h3>Where</h3>
      <AnimatedHeight style="overflow: visible;">
        <TransitionList :items="categories" key-field="name" class="categories">
          <template #default="{ item: row }">
            <RouterLink
              class="category"
              :to="{ query: { ...$route.query, category: row.name.toLowerCase() } }"
            >
              <div class="category-name">{{ row.name }}</div>
              <Meter class="category-bar" :percentage="row.share" />
              <div class="category-count">{{ row.count }}</div>
            </RouterLink>
          </template>
        </TransitionList>
      </AnimatedHeight>
    </div>

    <div v-if="prev || next" class="section">
      <h3>Nearby comparisons</h3>
      <div class="nearby">
        <RouterLink
          v-if="prev"
          class="nearby-card"
          :to="{ name: 'delta', params: { provider: 'mcje', a: prev.a, b: prev.b } }"
        >
          <NIcon :component="ArrowLeft16Filled" />
          <div>
            <Dim>Previous</Dim>
            <div class="nearby-pair">{{ prev.a }} &rarr; {{ prev.b }}</div>
          </div>
        </RouterLink>
        <RouterLink
          v-if="next"
          class="nearby-card next"
          :to="{ name: 'delta', params: { provider: 'mcje', a: next.a, b: next.b } }"
        >
          <div>
            <Dim>Next</Dim>
            <div class="nearby-pair">{{ next.a }} &rarr; {{ next.b }}</div>
          </div>
          <NIcon :component="ArrowRight16Filled" />
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/util/gradients.scss' as gradients;

.overview {
  --overview-width: 900px;

  display: flex;
  flex-direction: column;
  gap: 32px;
  width: 100%;
  max-width: var(--overview-width);
  margin-right: auto;
  margin-left: max(0px, calc(
    50% - var(--sidebar-width) / 2 - var(--overview-width) / 2 + var(--content-gutter) / 2
  ));
  padding-bottom: 40px;
}

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

.section {
  display: flex;
  flex-direction: column;
  gap: 12px;

  h3 {
    margin: 0;
  }
}

.state {
  flex: 1 1 140px;
  user-select: none;
  cursor: pointer;

  @include gradients.interactive-surface(30% 100%);
  transition:
    --intr-gradient-start_internal 200ms,
    --intr-gradient-end_internal 200ms,
    --intr-gradient-size 750ms,
    box-shadow 200ms,
    border-color 200ms,
    opacity 200ms;

  :deep(.n-card-content) {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 0;
  }

  &:hover:not(.empty) {
    --intr-color: oklch(from var(--color-accent) l calc(c * 1.3) h / 0.6);
    --intr-gradient-start: var(--intr-color);
    --intr-gradient-end-alpha: 0.15;
    --intr-gradient-size: 100% 100%;
    border-color: rgb(from var(--color-accent) r g b / 0.4) !important;
  }

  &.selected {
    --intr-color: oklch(from var(--color-accent) l calc(c * 1.3) h);
    --intr-gradient-start: var(--intr-color);
    --intr-gradient-end-alpha: 0.15;
    --intr-gradient-size: 100% 100%;
    border-color: rgb(from var(--color-accent) r g b / 0.6) !important;
    box-shadow: 0 0 8px rgb(from var(--intr-color) calc(1.2 * r) calc(1.2 * g) calc(1.2 * b) / 0.333);
  }

  &.dim {
    opacity: 0.6;
  }

  &.empty {
    opacity: 0.45;
    cursor: default;
  }
}

.state-count {
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.categories {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.category {
  display: grid;
  grid-template-columns: 140px 1fr 48px;
  align-items: center;
  gap: 12px;
  padding: 5px 8px;
  border-radius: 4px;
  text-decoration: none;
  color: inherit;
  user-select: none;

  &:hover {
    background: var(--color-1);
  }
}

.category-name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-bar.meter {
  width: auto;
}

.category-count {
  font-size: 13px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--color-dim);
}

.nearby {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.nearby-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--color-2);
  border-radius: 6px;
  text-decoration: none;
  color: var(--color-5);
  user-select: none;

  @include gradients.interactive-surface;
  transition:
    --intr-gradient-start_internal 100ms,
    --intr-gradient-end_internal 100ms,
    color 200ms;

  &:hover {
    --intr-color: rgb(from var(--color-accent) r g b / calc(alpha * 0.5));
    color: var(--color-6);
  }

  &.next {
    justify-content: flex-end;
    text-align: right;
    grid-column: 2;
  }
}

.nearby-pair {
  font-size: 14px;
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
