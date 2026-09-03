<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { DeltaResult } from '@/delta_providers'
import { formatBytes } from '@/util/bytes'
import DeltaSummary from '@/components/DeltaSummary.vue'
import VersionCompare, { type CompareSide } from '@/components/VersionCompare.vue'
import type { Renderable } from '@/types.ts'
import { readFilesMeta } from './filesMeta'

const props = defineProps<{
  dr: DeltaResult
}>()

type Side = {
  name: string
  size: number | null
}

const sideA = ref<Side>({ name: 'Version A', size: null })
const sideB = ref<Side>({ name: 'Version B', size: null })

function load() {
  const meta = readFilesMeta()
  sideA.value = { name: meta?.aName ?? 'Version A', size: meta?.aSize ?? null }
  sideB.value = { name: meta?.bName ?? 'Version B', size: meta?.bSize ?? null }
}

onMounted(load)

watch(() => [ props.dr.a, props.dr.b ], load)

function toSide({ size }: Side): CompareSide {
  return {
    facts: [
      ...size !== null ? [ { label: 'Size', value: formatBytes(size) } ] : [],
    ],
    links: [],
  }
}

const sides = computed(() => [ toSide(sideA.value), toSide(sideB.value) ])

const between = computed(() => {
  const rows: Renderable[] = []

  const sizeA = sideA.value.size
  const sizeB = sideB.value.size
  if (sizeA !== null && sizeB !== null) {
    const delta = sizeB - sizeA
    rows.push(delta === 0 ? 'same size' : `${delta > 0 ? '+' : '-'}${formatBytes(Math.abs(delta))}`)
  }

  return rows
})
</script>

<template>
  <div class="overview">
    <VersionCompare :sides="sides" :between="between">
      <template #picker="{ index }">
        <h3>{{ index === 0 ? sideA.name : sideB.name }}</h3>
      </template>
    </VersionCompare>

    <DeltaSummary :dr="dr" />
  </div>
</template>

<style lang="scss" scoped>

.overview {
  --overview-width: 900px;

  display: flex;
  flex-direction: column;
  gap: 32px;
  width: 100%;
  max-width: var(--overview-width);
  margin-inline: auto;
  padding-bottom: 40px;
}

@media (min-width: 1700px) {
  .overview {
    margin-right: auto;
    margin-left: max(0px, calc(
      50% - var(--sidebar-width) / 2 - var(--overview-width) / 2 + var(--content-gutter) / 2
    ));
  }
}

</style>
