<script setup lang="ts">
import type { DeltaResult } from '@/delta_providers'
import { deltaTableReader, sameOdds, sampleTableCached, stackKey, type LootOdds } from '@/util/loot'
import { itemName as translate } from '@/util/itemNames'
import { ItemIcon } from './lazyRenderers'
import Meter from './Meter.vue'
import Tooltip from './Tooltip.vue'
import { NSpin } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import NamespacedPath from './NamespacedPath.vue'
import Dim from './Dim.vue'

export interface LootSide {
  version: string
  table: any
}

type RowState = 'added' | 'changed' | 'removed' | 'same'

interface ItemRow {
  key: string
  id: string
  components?: Record<string, any>
  state: RowState
  before: LootOdds | null
  after: LootOdds | null
}

const props = defineProps<{
  dr: DeltaResult
  before?: LootSide
  after?: LootSide
  showUnchanged?: boolean
}>()

const emit = defineEmits<{
  counts: [counts: { added: number, changed: number, removed: number, same: number }]
}>()

const busy = ref(true)
const beforeOdds = ref<LootOdds[] | null>(null)
const afterOdds = ref<LootOdds[] | null>(null)

const isDiff = computed(() => !!props.before && !!props.after)

function oddsFor(side: LootSide | undefined) {
  if (!side) return null
  return sampleTableCached(side.table, deltaTableReader(props.dr, side.version))
}

let sampledTables: [ any, any ] | null = null

watch(() => [ props.before, props.after ], async () => {
  const tables: [ any, any ] = [ props.before?.table, props.after?.table ]
  if (sampledTables && sampledTables[0] === tables[0] && sampledTables[1] === tables[1]) return;
  sampledTables = tables

  busy.value = true
  const [ a, b ] = await Promise.all([ oddsFor(props.before), oddsFor(props.after) ])
  if (sampledTables !== tables) return;
  beforeOdds.value = a
  afterOdds.value = b
  busy.value = false
}, { immediate: true })

function via(odds: LootOdds) {
  return odds.via.join(', ')
}

function viaChanged(row: ItemRow) {
  return row.state === 'changed' && via(row.before!) !== via(row.after!)
}

const rows = computed<ItemRow[]>(() => {
  const a = beforeOdds.value ?? []
  const b = afterOdds.value ?? []

  if (!isDiff.value) {
    const only = beforeOdds.value ?? afterOdds.value ?? []
    return only.map(o => ({
      key: stackKey(o),
      id: o.id,
      components: o.components,
      state: 'same' as RowState,
      before: props.before ? o : null,
      after: props.before ? null : o,
    }))
  }

  const byKey = new Map<string, ItemRow>()
  for (const o of a) {
    byKey.set(stackKey(o), {
      key: stackKey(o), id: o.id, components: o.components,
      state: 'removed', before: o, after: null,
    })
  }
  for (const o of b) {
    const key = stackKey(o)
    const row = byKey.get(key)
    if (!row) {
      byKey.set(key, { key, id: o.id, components: o.components, state: 'added', before: null, after: o })
      continue
    }
    row.after = o
    row.state = sameOdds(row.before!, o) ? 'same' : 'changed'
  }
  return Array.from(byKey.values())
})

const sections = computed(() => {
  const order: RowState[] = [ 'added', 'changed', 'removed', 'same' ]
  const sort = (list: ItemRow[]) => list.sort((x, y) =>
    (y.after ?? y.before)!.chance - (x.after ?? x.before)!.chance
    || itemName(x).localeCompare(itemName(y)))
  return order.map(state => ({
    state,
    rows: sort(rows.value.filter(r => r.state === state)),
  })).filter(s => s.rows.length > 0)
})

watch(rows, list => {
  if (!isDiff.value) return;
  emit('counts', {
    added: list.filter(r => r.state === 'added').length,
    changed: list.filter(r => r.state === 'changed').length,
    removed: list.filter(r => r.state === 'removed').length,
    same: list.filter(r => r.state === 'same').length,
  })
}, { immediate: true })

const showAvg = computed(() => rows.value.some(row =>
  [ row.before, row.after ].some(odds => odds && odds.min !== odds.max)))

const headings: Record<RowState, string> = {
  added: 'New Items',
  changed: 'Changed Items',
  removed: 'Removed Items',
  same: 'Unchanged Items',
}

function itemName(row: ItemRow) {
  const odds = row.after ?? row.before!
  return translate(props.dr, iconVersion(row), odds.id, odds.components)
}

function fmtPct(chance: number) {
  const p = chance * 100
  if (p >= 99.95) return '100%'
  if (p < 0.1) return '<0.1%'
  return p.toFixed(1).replace(/\.0$/, '') + '%'
}

function fmtCount(o: LootOdds) {
  return o.min === o.max ? `×${o.min}` : `×${o.min}-${o.max}`
}

function fmtAvg(o: LootOdds) {
  return String(Math.round(o.avg * 10) / 10)
}

function iconVersion(row: ItemRow) {
  return (row.after ? props.after : props.before)!.version
}
</script>

<template>
  <div v-if="busy" class="loot-busy">
    <NSpin size="small" />
    <div>Measuring drop rates over 10,000 opens…</div>
  </div>
  <div v-else-if="!rows.length" class="loot-empty">This table never drops anything.</div>
  <div v-else-if="isDiff && !showUnchanged && !sections.some(s => s.state !== 'same')" class="loot-empty">
    The items this table drops did not change.
  </div>
  <div v-else class="loot-items" :class="{ diff: isDiff }">
    <template v-for="section of sections" :key="section.state">
      <div v-if="section.state !== 'same' || showUnchanged || !isDiff" class="section" :class="section.state">
        <h3 v-if="isDiff">{{ headings[section.state] }}</h3>
        <div class="grid-table" :class="{ 'with-avg': showAvg }">
          <div class="grid-table-row grid-table-header">
            <div></div>
            <div>Item</div>
            <div></div>
            <div class="right">Chance</div>
            <div class="right">Amount</div>
            <div v-if="showAvg" class="right">Avg</div>
          </div>
          <div class="grid-table-row" v-for="row of section.rows" :key="row.key">
            <div class="icon">
              <ItemIcon :dr="dr" :version="iconVersion(row)" :id="row.id" :components="row.components" :size="32" />
            </div>
            <div class="name">
              <Tooltip>
                <template #trigger="{ props }">
                  <span v-bind="props">{{ itemName(row) }}</span>
                </template>
                <NamespacedPath :value="row.id" />
              </Tooltip>
              <span v-if="viaChanged(row)" class="via">
                · <Dim>{{ via(row.before!) ? `via ${via(row.before!)}` : 'direct' }}</Dim>
                <span class="arrow">→</span>{{ via(row.after!) ? `via ${via(row.after!)}` : 'direct' }}
              </span>
              <span v-else-if="via((row.after ?? row.before)!)" class="via">
                · via {{ via((row.after ?? row.before)!) }}
              </span>
            </div>
            <Meter
              :percentage="(row.after ?? row.before)!.chance * 100"
              :old="row.state === 'changed' ? row.before!.chance * 100 : undefined"
            />
            <div class="right value">
              <template v-if="row.state === 'changed'">
                <Dim>{{ fmtPct(row.before!.chance) }}</Dim>
                <span class="arrow">→</span>
              </template>
              {{ fmtPct((row.after ?? row.before)!.chance) }}
            </div>
            <Dim class="right value" tag="div">
              <template v-if="row.state === 'changed' && fmtCount(row.before!) !== fmtCount(row.after!)">
                <Dim>{{ fmtCount(row.before!) }}</Dim>
                <span class="arrow">→</span>
              </template>
              {{ fmtCount((row.after ?? row.before)!) }}
            </Dim>
            <Dim v-if="showAvg" class="right value" tag="div">
              <template v-if="row.state === 'changed' && fmtAvg(row.before!) !== fmtAvg(row.after!)">
                <Dim>{{ fmtAvg(row.before!) }}</Dim>
                <span class="arrow">→</span>
              </template>
              {{ fmtAvg((row.after ?? row.before)!) }}
            </Dim>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use './loot.scss';

.section {
  padding: 8px 0 16px;

  &:last-child {
    padding-bottom: 0;
  }

  h3 {
    margin-left: 12px;
  }

  &.added {
    --section-color: var(--color-success);
  }

  &.changed {
    --section-color: var(--color-accent-suppl);
  }

  &.removed {
    --section-color: var(--color-danger);
  }

  &.same {
    --section-color: var(--color-4);
  }

  .diff & .name {
    color: var(--section-color);
  }
}

.grid-table {
  grid-template-columns: auto 1fr auto auto auto;

  &.with-avg {
    grid-template-columns: auto 1fr auto auto auto auto;
  }
}

.grid-table-row > * {
  display: flex;
  align-items: center;
  padding-block: 4px;
}

.grid-table-row > :nth-child(n + 3) {
  padding-left: 16px;
}

.icon {
  padding-left: 12px;
}

.right {
  justify-content: flex-end;
}

.grid-table-row > :last-child {
  padding-right: 12px;
}

.via {
  margin-left: 4px;
  color: var(--color-4);
}

</style>
