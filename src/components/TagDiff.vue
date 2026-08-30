<script setup lang="ts">
import { computed, watch } from 'vue'
import Dim from './Dim.vue'
import NamespacedPath from './NamespacedPath.vue'
import { tagEntryKey, type Tag, type TagEntry } from '@/util/tag'

const props = withDefaults(defineProps<{
  original: Tag | null
  modified: Tag | null
  showUnchanged?: boolean
}>(), {
  showUnchanged: false,
})

const emit = defineEmits<{
  counts: [counts: { unchanged: number }]
}>()

function counted(entries: TagEntry[]) {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const key = tagEntryKey(entry)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function classify(from: TagEntry[], to: TagEntry[]) {
  const counts = counted(to)
  return from.map(entry => {
    const key = tagEntryKey(entry)
    const count = counts.get(key) ?? 0
    if (count === 0) return { entry, matched: false }
    counts.set(key, count - 1)
    return { entry, matched: true }
  })
}

const single = computed(() => props.original && props.modified ? null : props.original ?? props.modified)

const replaceChanged = computed(() => !single.value && !!props.original!.replace !== !!props.modified!.replace)

const replace = computed(() => {
  if (props.original?.replace === undefined && props.modified?.replace === undefined) return null
  if (replaceChanged.value) {
    return props.modified!.replace
      ? 'This tag list now replaces the underlying tag list instead of adding to it.'
      : 'This tag list now adds to the underlying tag list instead of replacing it.'
  }
  return props.original?.replace || props.modified?.replace
    ? 'This tag list replaces the underlying tag list instead of adding to it.'
    : 'This tag list adds to the underlying tag list.'
})

const numbered = computed(() => {
  if (single.value) {
    const rows = single.value.values.map((entry, i) => ({ entry, number: i + 1 }))
    return {
      total: rows.length,
      unchanged: 0,
      sections: rows.length > 0
        ? [ { title: replace.value === null ? '' : 'Tag Entries', state: '', rows } ]
        : [],
    }
  }

  const current = classify(props.modified!.values, props.original!.values)

  const added: Array<{ entry: TagEntry, number: number }> = []
  const unchanged: Array<{ entry: TagEntry, number: number }> = []
  current.forEach((item, i) => {
    (item.matched ? unchanged : added).push({ entry: item.entry, number: i + 1 })
  })

  const removed = classify(props.original!.values, props.modified!.values)
    .map((item, i) => ({ entry: item.entry, matched: item.matched, number: i + 1 }))
    .filter(item => !item.matched)

  return {
    total: Math.max(current.length, props.original!.values.length),
    unchanged: unchanged.length,
    sections: [
      { title: 'New Tag Entries', state: 'added', rows: added },
      { title: 'Removed Tag Entries', state: 'removed', rows: removed },
      ...props.showUnchanged ? [ { title: 'Unchanged Tag Entries', state: '', rows: unchanged } ] : [],
    ].filter(section => section.rows.length > 0),
  }
})

watch(() => numbered.value.unchanged, count => emit('counts', { unchanged: count }), { immediate: true })

const indexWidth = computed(() => `${String(numbered.value.total).length}ch`)

const empty = computed(() => numbered.value.total === 0)
</script>

<template>
  <div v-if="replace !== null" class="section" :class="{ edited: replaceChanged }">
    <div class="entry">{{ replace }}</div>
  </div>
  <div v-if="empty" class="section">
    <div class="entry"><Dim>This tag list has no entries.</Dim></div>
  </div>
  <div
    v-for="section of numbered.sections"
    class="section"
    :class="section.state"
    :style="{ '--index-width': indexWidth }"
  >
    <h3 v-if="section.title">{{ section.title }}</h3>
    <div class="entries">
      <div class="entry" v-for="row of section.rows">
        <Dim><span class="index">{{ row.number }}</span>.</Dim>
        <code><Dim v-if="row.entry.tag">#</Dim><NamespacedPath :value="row.entry.id" /></code>
        <Dim v-if="!row.entry.required">optional</Dim>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>

.section {
  padding: 8px 0 0;

  h3 {
    margin-left: 12px;
  }

  &.added .entry {
    color: var(--color-success);
  }

  &.edited .entry {
    color: var(--color-accent-suppl);
  }

  &.removed .entry {
    color: var(--color-danger);
  }
}

.entry {
  display: flex;
  gap: 8px;
  padding: 2px 12px;
  font-weight: 500;

  &:nth-child(even) {
    background-color: var(--color-1);
  }
}

.index {
  display: inline-block;
  min-width: var(--index-width);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

</style>
