<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard } from 'naive-ui'
import type { DeltaResult } from '@/delta_providers'
import { DeltaTrackState } from '@/delta_providers/states'
import AnimatedHeight from './AnimatedHeight.vue'
import Col from './Col.vue'
import Meter from './Meter.vue'
import Row from './Row.vue'
import TrackTag from './TrackTag.vue'
import TransitionList from './TransitionList.vue'

const props = defineProps<{
  dr: DeltaResult
}>()

const router = useRouter()
const route = useRoute()

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
