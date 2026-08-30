<script setup lang="ts">
import { computed } from 'vue'
import Dim from './Dim.vue'
import NamespacedPath from './NamespacedPath.vue'
import { tagEntryKey, type Tag, type TagEntry } from '@/util/tag'

const props = defineProps<{
  original: Tag | null
  modified: Tag | null
}>()

function partition(from: TagEntry[], to: TagEntry[]) {
  const counts = new Map<string, number>()
  for (const entry of to) {
    const key = tagEntryKey(entry)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const only: TagEntry[] = []
  const both: TagEntry[] = []
  for (const entry of from) {
    const key = tagEntryKey(entry)
    const count = counts.get(key) ?? 0
    if (count === 0) {
      only.push(entry)
    } else {
      counts.set(key, count - 1)
      both.push(entry)
    }
  }
  return { only, both }
}

const single = computed(() => props.original && props.modified ? null : props.original ?? props.modified)

const split = computed(() => single.value
  ? { only: [], both: [] }
  : partition(props.modified!.values, props.original!.values))

const added = computed(() => split.value.only)
const unchanged = computed(() => split.value.both)
const removed = computed(() => single.value ? [] : partition(props.original!.values, props.modified!.values).only)

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
</script>

<template>
  <div v-if="replace !== null" class="section" :class="{ edited: replaceChanged }">
    <div class="entry">{{ replace }}</div>
  </div>
  <div v-if="single" class="section">
    <h3 v-if="replace !== null">Tag Entries</h3>
    <div class="entries">
      <div class="entry" v-for="entry of single.values">
        <code><Dim v-if="entry.tag">#</Dim><NamespacedPath :value="entry.id" /></code>
        <Dim v-if="!entry.required">optional</Dim>
      </div>
    </div>
  </div>
  <template v-else>
    <div v-if="added.length > 0" class="section added">
      <h3>New Tag Entries</h3>
      <div class="entries">
        <div class="entry" v-for="entry of added">
          <code><Dim v-if="entry.tag">#</Dim><NamespacedPath :value="entry.id" /></code>
          <Dim v-if="!entry.required">optional</Dim>
        </div>
      </div>
    </div>
    <div v-if="removed.length > 0" class="section removed">
      <h3>Removed Tag Entries</h3>
      <div class="entries">
        <div class="entry" v-for="entry of removed">
          <code><Dim v-if="entry.tag">#</Dim><NamespacedPath :value="entry.id" /></code>
          <Dim v-if="!entry.required">optional</Dim>
        </div>
      </div>
    </div>
    <div v-if="unchanged.length > 0" class="section">
      <h3>Unchanged Tag Entries</h3>
      <div class="entries">
        <div class="entry" v-for="entry of unchanged">
          <code><Dim v-if="entry.tag">#</Dim><NamespacedPath :value="entry.id" /></code>
          <Dim v-if="!entry.required">optional</Dim>
        </div>
      </div>
    </div>
  </template>
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

</style>
