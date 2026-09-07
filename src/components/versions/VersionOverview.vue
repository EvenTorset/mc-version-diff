<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { ManifestVersion, VersionDetails } from 'minecraft-asset-loader'
import type { DeltaResult } from '@/delta_providers'
import { findVersion, getRelatedDeltas, type RelatedDeltaGroup, type RelatedDeltaLink } from '@/delta_providers/manifest'
import DeltaSummary from '@/components/DeltaSummary.vue'
import RelatedDeltas from '@/components/RelatedDeltas.vue'
import VersionCompare, { type CompareFact, type CompareLink, type CompareSide } from '@/components/VersionCompare.vue'
import VersionPicker from './VersionPicker.vue'
import type { Edition } from './edition'
import type { Renderable } from '@/types'

const props = defineProps<{
  edition: Edition
  dr: DeltaResult
}>()

const router = useRouter()

type Side = {
  version: ManifestVersion | null
  details: VersionDetails | null
  facts: CompareFact[]
  links: CompareLink[]
}

const empty: Side = { version: null, details: null, facts: [], links: [] }

const sideA = shallowRef<Side>(empty)
const sideB = shallowRef<Side>(empty)
const nearby = ref<RelatedDeltaGroup[]>([])
const nearbyLinks = ref<RelatedDeltaLink[]>([])

async function loadSide(id: string): Promise<Side> {
  const version = await findVersion(props.edition.assets, id)
  const details = await version?.details() ?? null
  const extra = version && details && props.edition.overview
    ? await props.edition.overview(version, details)
    : { facts: [], links: [] }
  return { version, details, ...extra }
}

async function load() {
  const [ a, b, related ] = await Promise.all([
    loadSide(props.dr.a),
    loadSide(props.dr.b),
    getRelatedDeltas(props.edition, props.dr.a, props.dr.b),
  ])
  sideA.value = a
  sideB.value = b
  nearby.value = related.groups
  nearbyLinks.value = related.links
}

onMounted(load)

watch(() => [ props.dr.a, props.dr.b ], load)

function go(a: string, b: string) {
  if (a === b) return
  router.push({ name: 'delta', params: { provider: props.edition.id, a, b } })
}

const TIPS = {
  released: 'When this version was published by Mojang.',
  type: 'Release versions are the finished updates. Snapshots are the weekly previews of the next one.',
}

function toSide({ version, facts, links }: Side): CompareSide {
  if (!version) return { facts: [], links: [] }
  return {
    facts: [
      { label: 'Released', time: new Date(version.releaseTime), tip: TIPS.released },
      { label: 'Type', value: version.type, tip: TIPS.type },
      ...facts,
    ],
    links,
  }
}

const sides = computed(() => [ toSide(sideA.value), toSide(sideB.value) ])

const between = computed(() => {
  const rows: Renderable[] = []

  const timeA = sideA.value.version?.releaseTime
  const timeB = sideB.value.version?.releaseTime
  if (timeA && timeB) {
    const days = Math.round(Math.abs(new Date(timeB).valueOf() - new Date(timeA).valueOf()) / 86400000)
    rows.push(days === 0 ? 'same day' : days === 1 ? '1 day apart' : `${days} days apart`)
  }

  const detailsA = sideA.value.details
  const detailsB = sideB.value.details
  if (detailsA && detailsB && props.edition.between) {
    rows.push(...props.edition.between(detailsA, detailsB))
  }

  return rows
})
</script>

<template>
  <div class="overview">
    <VersionCompare :sides="sides" :between="between" swappable @swap="go(dr.b, dr.a)">
      <template #picker="{ index }">
        <VersionPicker
          :edition="edition"
          :model-value="index === 0 ? dr.a : dr.b"
          :disabled-versions="[ index === 0 ? dr.b : dr.a ]"
          @update:model-value="id => index === 0 ? go(id, dr.b) : go(dr.a, id)"
        />
      </template>
    </VersionCompare>

    <DeltaSummary :dr="dr" />

    <RelatedDeltas :provider="edition.id" :groups="nearby" :links="nearbyLinks" />
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
