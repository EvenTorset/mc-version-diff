<script lang="ts">
export type AdjacentDelta = { a: string, b: string } | null

export type NearbyGroup = {
  label?: string
  prev: AdjacentDelta
  next: AdjacentDelta
}

export type NearbyLink = {
  label: string
  a: string
  b: string
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { NIcon } from 'naive-ui'
import { ArrowLeft16Filled, ArrowRight16Filled } from '@vicons/fluent'
import Dim from './Dim.vue'

const props = withDefaults(defineProps<{
  provider: string
  groups: NearbyGroup[]
  links?: NearbyLink[]
}>(), {
  links: () => [],
})

type Card = {
  label: string
  back: boolean
  a: string
  b: string
}

type Row = {
  left: Card | null
  right: Card | null
}

function suffix(label?: string) {
  return label ? ` ${label}` : ''
}

const rows = computed<Row[]>(() => {
  const complete: Row[] = []
  const back: Card[] = []
  const forward: Card[] = []

  for (const group of props.groups) {
    const prev = group.prev
      ? { label: `Previous${suffix(group.label)}`, back: true, ...group.prev }
      : null
    const next = group.next
      ? { label: `Next${suffix(group.label)}`, back: false, ...group.next }
      : null
    if (prev && next) complete.push({ left: prev, right: next })
    else if (prev) back.push(prev)
    else if (next) forward.push(next)
  }

  for (const link of props.links) back.push({ ...link, back: true })

  const rest: Row[] = []
  let b = 0
  let f = 0
  while (b < back.length || f < forward.length) {
    const left = b < back.length
      ? back[b++]
      : forward.length - f > 1 ? forward[f++] : null
    const right = f < forward.length
      ? forward[f++]
      : b < back.length ? back[b++] : null
    rest.push({ left, right })
  }

  return [ ...complete, ...rest ]
})
</script>

<template>
  <div v-if="rows.length > 0" class="section">
    <h3>Related</h3>
    <div class="nearby">
      <div v-for="(row, i) of rows" :key="i" class="nearby-row">
        <template v-for="(card, slot) of [ row.left, row.right ]" :key="slot">
          <RouterLink
            v-if="card"
            class="nearby-card"
            :class="{ trailing: !card.back, second: slot === 1 }"
            :to="{ name: 'delta', params: { provider, a: card.a, b: card.b } }"
          >
            <NIcon v-if="card.back" :component="ArrowLeft16Filled" />
            <div>
              <Dim>{{ card.label }}</Dim>
              <div class="nearby-pair">{{ card.a }} &rarr; {{ card.b }}</div>
            </div>
            <NIcon v-if="!card.back" :component="ArrowRight16Filled" />
          </RouterLink>
        </template>
      </div>
    </div>
  </div>
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

.nearby {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nearby-row {
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

  &.trailing {
    justify-content: flex-end;
    text-align: right;
  }

  &.second {
    grid-column: 2;
  }
}

.nearby-pair {
  font-size: 14px;
}

</style>
