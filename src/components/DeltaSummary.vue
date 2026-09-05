<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NCard } from 'naive-ui'
import type { DeltaResult } from '@/delta_providers'
import { DeltaTrackState } from '@/delta_providers/states'
import AnimatedHeight from './AnimatedHeight.vue'
import Col from './Col.vue'
import Meter from './Meter.vue'
import Row from './Row.vue'
import TrackTag from './TrackTag.vue'
import TransitionList from './TransitionList.vue'
import { Settings } from '@/settings.ts'
import { naturalCompare } from '@/util/sort.ts'
import { copyToClipboard } from '@/util/clipboard.ts'
import Notify from '@/notify.tsx'
import { errorMessage } from '@/util/errorMessage.ts'
import Tooltip from './Tooltip.vue'
import Dim from './Dim.vue'

const props = defineProps<{
  dr: DeltaResult
}>()

const router = useRouter()
const route = useRoute()

const stateSummary = computed(() => {
  const counts: Record<string, number> = { Added: 0, Edited: 0, Moved: 0, Removed: 0 }
  for (const track of props.dr.tracks) counts[DeltaTrackState[track.state]]++
  return [
    { state: DeltaTrackState.Added, count: counts.Added },
    { state: DeltaTrackState.Edited, count: counts.Edited },
    { state: DeltaTrackState.Moved, count: counts.Moved },
    { state: DeltaTrackState.Removed, count: counts.Removed },
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

const hasMovedFiles = computed(() => props.dr.tracks.some(t => t.state === DeltaTrackState.Moved))
const hasActions = computed(() => Settings.enableCopyStatusButton || hasMovedFiles.value)

async function copySpreadsheet() {
  try {
    const content = (await Promise.all(
      props.dr.tracks
        .filter(t => (
          t.state === DeltaTrackState.Added
          || t.state === DeltaTrackState.Edited
        ) && t.b.endsWith('.png'))
        .sort((a, b) => naturalCompare(a.id, b.id))
        .map(async t => [
          (await props.dr.getEntry(props.dr.b, t.b)).toBase64({ alphabet: 'base64url' }),
          t.b.replace(/^assets\/minecraft\/textures\//, '')
        ].join('\t'))
    )).join('\n')
    await copyToClipboard(new TextEncoder().encode(content), 'text/plain')
    Notify.success({
      content: 'Copied!',
      duration: 1000,
    })
  } catch (err) {
    console.error(err)
    Notify.error(errorMessage(err))
  }
}
</script>

<template>
  <template v-if="dr.tracks.length === 0">
    <Col style="flex: 1;">
      <h1>No changes</h1>
      <p>{{ dr.a }} and {{ dr.b }} have identical assets and data.</p>
    </Col>
  </template>
  <template v-else>
    <div class="section">
      <h3>Changes</h3>
      <Row class="states" gap="10px" align="stretch" wrap>
        <NCard
          v-for="{ state, count } of stateSummary"
          :key="DeltaTrackState[state]"
          class="state"
          :class="{
            empty: count === 0,
            selected: activeState === DeltaTrackState[state],
            dim: activeState !== null && activeState !== DeltaTrackState[state],
          }"
          size="small"
          @click="count > 0 && toggleState(DeltaTrackState[state])"
        >
          <Col>
            <div class="state-count">{{ count }}</div>
            <TrackTag :state full-width />
          </Col>
        </NCard>
      </Row>
    </div>

    <div v-if="categories.length > 0" class="section">
      <h3>Files</h3>
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

    <div v-if="hasActions">
      <h3>Actions</h3>
      <Row>
        <RouterLink
          v-if="hasMovedFiles"
          :to="{ query: { ...$route.query, category: 'generate-move-script' } }"
        >
          <NButton>Generate move script</NButton>
        </RouterLink>
        <Tooltip v-if="Settings.enableCopyStatusButton">
          <template #trigger="{ props }">
            <NButton v-bind="props" @click="copySpreadsheet">Copy spreadsheet</NButton>
          </template>
          <h3>Copy spreadsheet</h3>
          <p>Copies the added and edited textures as tab-separated values.</p>
          <Dim tag='p'>[ Dokucraft ]</Dim>
        </Tooltip>
      </Row>
    </div>
  </template>
</template>

<style lang="scss" scoped>
@use '@/util/gradients.scss' as gradients;

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
    --intr-gradient-size 300ms,
    box-shadow 200ms,
    border-color 200ms,
    color 200ms,
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
    color: var(--color-6);
  }

  &.selected {
    --intr-color: oklch(from var(--color-accent) l calc(c * 1.3) h);
    --intr-gradient-start: var(--intr-color);
    --intr-gradient-end-alpha: 0.15;
    --intr-gradient-size: 100% 100%;
    border-color: rgb(from var(--color-accent) r g b / 0.6) !important;
    box-shadow: 0 0 8px rgb(from var(--intr-color) calc(1.2 * r) calc(1.2 * g) calc(1.2 * b) / 0.333);
    color: var(--color-6);
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
  font-size: 1.8em;
  font-weight: 400;
}

.categories {
  display: grid;
  grid-template-columns: auto 1fr auto;
  row-gap: 2px;
  column-gap: 16px;

  &>:deep(.transition-list-item) {
    grid-column: 1/-1;
    display: grid;
    grid-template-columns: subgrid;
  }
}

.category {
  grid-column: 1/-1;
  display: grid;
  grid-template-columns: subgrid;
  align-items: center;
  padding: 4px 8px;
  border-radius: 4px;
  text-decoration: none;
  color: inherit;
  user-select: none;

  &:hover {
    background: var(--color-1);
    color: var(--color-6);

    .category-count {
      color: var(--color-accent-suppl);
    }

    :deep(.n-progress-graph-line-fill) {
      background-color: var(--color-accent-suppl) !important;
    }
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
  font-size: 14px;
  text-align: right;
  color: var(--color-accent);
  font-weight: 600;
  font-family: var(--monospace-font-family);
}

</style>
