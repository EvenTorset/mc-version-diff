<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { DeltaResult } from '@/delta_providers'
import { formatBytes } from '@/util/bytes'
import DeltaSummary from '@/components/DeltaSummary.vue'
import VersionCompare, { type CompareSide } from '@/components/VersionCompare.vue'
import type { Renderable } from '@/types.ts'
import { readFilesMeta } from './filesMeta'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps<{
  dr: DeltaResult
}>()

const router = useRouter()
const route = useRoute()

const sideASize = ref<number | null>(null)
const sideBSize = ref<number | null>(null)

function load() {
  const meta = readFilesMeta()
  const [ aSize, bSize ] = route.params.b === 'swap'
    ? [ meta?.bSize, meta?.aSize ]
    : [ meta?.aSize, meta?.bSize ]
  sideASize.value = aSize ?? null
  sideBSize.value = bSize ?? null
}

onMounted(load)

watch(() => [ props.dr.a, props.dr.b ], load)

function toSide(size: number | null): CompareSide {
  return {
    facts: [
      ...size !== null ? [ { label: 'Size', value: formatBytes(size) } ] : [],
    ],
    links: [],
  }
}

const sides = computed(() => [ toSide(sideASize.value), toSide(sideBSize.value) ])

const between = computed(() => {
  const rows: Renderable[] = []

  const sizeA = sideASize.value
  const sizeB = sideBSize.value
  if (sizeA !== null && sizeB !== null) {
    const delta = sizeB - sizeA
    rows.push(delta === 0 ? 'same size' : `${delta > 0 ? '+' : '-'}${formatBytes(Math.abs(delta))}`)
  }

  return rows
})

function swap() {
  router.push({ name: 'delta', params: {
    provider: route.params.provider,
    a: route.params.a,
    b: route.params.b === 'swap' ? undefined : 'swap'
  } })
}
</script>

<template>
  <div class="overview">
    <VersionCompare :sides="sides" :between="between" swappable @swap="swap">
      <template #picker="{ index }">
        <h3>{{ index === 0 ? dr.a : dr.b }}</h3>
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
