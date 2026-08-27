<script setup lang="ts">
import { describeTable, type LootRuleEntry, type LootRulePool } from '@/util/loot'
import Meter from './Meter.vue'
import { computed } from 'vue'

type RowState = 'added' | 'changed' | 'removed' | 'same'

interface EntryRow {
  state: RowState
  before: LootRuleEntry | null
  after: LootRuleEntry | null
}

interface PoolRow {
  state: RowState
  index: number
  before: LootRulePool | null
  after: LootRulePool | null
  entries: EntryRow[]
}

const props = defineProps<{
  before?: any
  after?: any
}>()

const isDiff = computed(() => !!props.before && !!props.after)

const pools = computed<PoolRow[]>(() => {
  const a = props.before ? describeTable(props.before) : []
  const b = props.after ? describeTable(props.after) : []

  if (!isDiff.value) {
    const only = props.before ? a : b
    return only.map((pool, index) => ({
      state: 'same' as RowState,
      index,
      before: props.before ? pool : null,
      after: props.before ? null : pool,
      entries: pool.entries.map(entry => ({
        state: 'same' as RowState,
        before: props.before ? entry : null,
        after: props.before ? null : entry,
      })),
    }))
  }

  const rows: PoolRow[] = []
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const before = a[index] ?? null
    const after = b[index] ?? null
    if (!after) {
      rows.push({ state: 'removed', index, before, after,
        entries: before!.entries.map(entry => ({ state: 'removed', before: entry, after: null })) })
      continue
    }
    if (!before) {
      rows.push({ state: 'added', index, before, after,
        entries: after.entries.map(entry => ({ state: 'added', before: null, after: entry })) })
      continue
    }
    const entries = diffEntries(before.entries, after.entries)
    const changed = headChanged(before, after) || entries.some(e => e.state !== 'same')
    rows.push({ state: changed ? 'changed' : 'same', index, before, after, entries })
  }
  return rows
})

// entries are matched by name, since a pool's list order shifts as entries come
// and go while the names are what a reader is tracking
function diffEntries(before: LootRuleEntry[], after: LootRuleEntry[]): EntryRow[] {
  const rows: EntryRow[] = []
  const taken = new Set<number>()
  for (const entry of before) {
    const index = after.findIndex((e, i) => !taken.has(i) && e.name === entry.name)
    if (index === -1) {
      rows.push({ state: 'removed', before: entry, after: null })
      continue
    }
    taken.add(index)
    const match = after[index]
    rows.push({ state: sameEntry(entry, match) ? 'same' : 'changed', before: entry, after: match })
  }
  after.forEach((entry, i) => {
    if (!taken.has(i)) rows.push({ state: 'added', before: null, after: entry })
  })
  return rows
}

function sameEntry(a: LootRuleEntry, b: LootRuleEntry) {
  return a.pct === b.pct && a.count === b.count && a.note === b.note
}

function headChanged(a: LootRulePool, b: LootRulePool) {
  return a.rolls !== b.rolls || a.bonus !== b.bonus || a.chance !== b.chance
}

function head(pool: LootRulePool) {
  const parts = [ `${pool.rolls} roll${pool.rolls === '1' ? '' : 's'}` ]
  if (pool.bonus) parts.push(`+${pool.bonus} bonus`)
  if (pool.chance) parts.push(pool.chance)
  return parts.join(' · ')
}

function entryOf(row: EntryRow) {
  return (row.after ?? row.before)!
}

function countChanged(row: EntryRow) {
  return row.state === 'changed' && row.before!.count !== row.after!.count
}

function noteChanged(row: EntryRow) {
  return row.state === 'changed' && row.before!.note !== row.after!.note
}

const labels: Record<RowState, string> = {
  added: 'New pool',
  changed: 'Changed pool',
  removed: 'Removed pool',
  same: 'Pool',
}
</script>

<template>
  <div v-if="!pools.length" class="loot-empty">This table has no pools.</div>
  <div v-else class="loot-rules">
    <div v-for="pool of pools" :key="pool.index" class="pool" :class="pool.state">
      <h3 class="pool-head">
        <span class="pool-label">{{ isDiff ? labels[pool.state] : 'Pool' }} {{ pool.index + 1 }}</span>
        <span class="pool-meta">
          <template v-if="pool.state === 'changed' && head(pool.before!) !== head(pool.after!)">
            <span class="was">{{ head(pool.before!) }}</span>
            <span class="arrow">→</span>
          </template>
          {{ head((pool.after ?? pool.before)!) }}
        </span>
      </h3>
      <div class="grid-table">
        <div class="grid-table-row grid-table-header">
          <div>Entry</div>
          <div></div>
          <div class="right">Weight</div>
          <div class="right">Amount</div>
        </div>
        <div class="grid-table-row" v-for="(row, i) of pool.entries" :key="i" :class="row.state">
          <div class="name">
            {{ entryOf(row).name }}
            <span v-if="noteChanged(row)" class="note">
              · <span class="was">{{ row.before!.note || '—' }}</span>
              <span class="arrow">→</span>{{ row.after!.note || '—' }}
            </span>
            <span v-else-if="entryOf(row).note" class="note"> · {{ entryOf(row).note }}</span>
          </div>
          <Meter
            :percentage="entryOf(row).pct"
            :old="row.state === 'changed' ? row.before!.pct : undefined"
          />
          <div class="right value">
            <template v-if="row.state === 'changed' && row.before!.pct !== row.after!.pct">
              <span class="was">{{ row.before!.pct }}%</span>
              <span class="arrow">→</span>
            </template>
            {{ entryOf(row).pct }}%
          </div>
          <div class="right value dim">
            <template v-if="countChanged(row)">
              <span class="was">{{ row.before!.count ? `×${row.before!.count}` : '—' }}</span>
              <span class="arrow">→</span>
            </template>
            {{ entryOf(row).count ? `×${entryOf(row).count}` : '' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use './loot.scss';

.pool {
  padding: 8px 0 16px;

  &:last-child {
    padding-bottom: 0;
  }

  &.added {
    --state-color: var(--color-success);
  }

  &.changed {
    --state-color: var(--color-accent-suppl);
  }

  &.removed {
    --state-color: var(--color-danger);
  }

  .name {
    color: var(--state-color, inherit);
  }

  &.removed .name {
    text-decoration: line-through;
  }
}

.pool-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-left: 12px;
}

.pool-label {
  color: var(--color-6);
}

.pool-meta {
  color: var(--color-4);
  font-size: 14px;
  font-weight: 400;
}

.grid-table {
  grid-template-columns: 1fr auto auto auto;
}

.grid-table-row > * {
  display: flex;
  align-items: center;
  padding-block: 4px;
}

.grid-table-row > :first-child {
  padding-left: 12px;
}

.grid-table-row > :not(:first-child) {
  padding-left: 16px;
}

.grid-table-row > :last-child {
  padding-right: 12px;
}

.right {
  justify-content: flex-end;
}

.note {
  color: var(--color-4);
}

</style>
