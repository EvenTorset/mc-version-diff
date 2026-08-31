<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { DeltaResult } from '@/delta_providers'
import {
  getNearbyDeltas,
  getVersion,
  getVersionDetails,
  type MCJEManifestVersion,
  type MCJEVersionDetails,
  type NearbyDeltaGroup,
} from './version_manifest'
import { getPackFormats, type PackFormats } from './pack_formats'
import MCJEVersionPicker from './MCJEVersionPicker.vue'
import { formatBytes } from '@/util/bytes'
import DeltaSummary from '@/components/DeltaSummary.vue'
import NearbyDeltas from '@/components/NearbyDeltas.vue'
import VersionCompare, { type CompareSide } from '@/components/VersionCompare.vue'

const props = defineProps<{
  dr: DeltaResult
}>()

const router = useRouter()

type Side = {
  version: MCJEManifestVersion | null
  details: MCJEVersionDetails | null
  packs: PackFormats | null
}

const empty: Side = { version: null, details: null, packs: null }

const sideA = ref<Side>(empty)
const sideB = ref<Side>(empty)
const nearby = ref<NearbyDeltaGroup[]>([])

async function loadSide(id: string): Promise<Side> {
  const [ version, details ] = await Promise.all([ getVersion(id), getVersionDetails(id) ])
  return { version, details, packs: getPackFormats(id) }
}

async function load() {
  const [ a, b, groups ] = await Promise.all([
    loadSide(props.dr.a),
    loadSide(props.dr.b),
    getNearbyDeltas(props.dr.a, props.dr.b),
  ])
  sideA.value = a
  sideB.value = b
  nearby.value = groups
}

onMounted(load)

watch(() => [ props.dr.a, props.dr.b ], load)

function go(a: string, b: string) {
  if (a === b) return
  router.push({ name: 'delta', params: { provider: 'mcje', a, b } })
}

const TIPS: Record<string, string> = {
  released: 'When this version was published by Mojang.',
  type: 'Release versions are the finished updates. Snapshots are the weekly previews of the next one.',
  size: 'Download size of the client jar, which holds the code, textures, models and data.',
  assets: 'Combined size of the sounds and language files, which live outside the jar and are downloaded separately.',
  assetIndex: 'Names the list of external assets this version uses. Versions sharing an index share those files.',
  resource: 'The resource pack format this version accepts. A pack made for a different number needs updating.',
  data: 'The data pack format this version accepts. A pack made for a different number needs updating.',
}

function toSide({ version, details, packs }: Side): CompareSide {
  if (!version || !details) return { facts: [], downloads: [] }
  return {
    facts: [
      { label: 'Released', time: new Date(version.releaseTime), tip: TIPS.released },
      { label: 'Type', value: version.type, tip: TIPS.type },
      { label: 'Size', value: formatBytes(details.downloads.client.size), tip: TIPS.size },
      { label: 'Assets', value: formatBytes(details.assetIndex.totalSize), tip: TIPS.assets },
      { label: 'Asset index', value: details.assetIndex.id, tip: TIPS.assetIndex },
      ...packs?.resource ? [ { label: 'Resource pack format', value: packs.resource, tip: TIPS.resource } ] : [],
      ...packs?.data ? [ { label: 'Data pack format', value: packs.data, tip: TIPS.data } ] : [],
    ],
    downloads: [
      { label: 'Client jar', url: details.downloads.client.url },
      ...details.downloads.server ? [ { label: 'Server jar', url: details.downloads.server.url } ] : [],
    ],
  }
}

const sides = computed(() => [ toSide(sideA.value), toSide(sideB.value) ])

const between = computed(() => {
  const lines: string[] = []

  const timeA = sideA.value.version?.releaseTime
  const timeB = sideB.value.version?.releaseTime
  if (timeA && timeB) {
    const days = Math.round(Math.abs(new Date(timeB).valueOf() - new Date(timeA).valueOf()) / 86400000)
    lines.push(days === 0 ? 'same day' : days === 1 ? '1 day apart' : `${days} days apart`)
  }

  const sizeA = sideA.value.details?.downloads.client.size
  const sizeB = sideB.value.details?.downloads.client.size
  if (sizeA !== undefined && sizeB !== undefined) {
    const delta = sizeB - sizeA
    lines.push(delta === 0 ? 'same size' : `${delta > 0 ? '+' : '-'}${formatBytes(Math.abs(delta))}`)
  }

  return lines
})
</script>

<template>
  <div class="overview">
    <VersionCompare :sides="sides" :between="between">
      <template #picker="{ index }">
        <MCJEVersionPicker
          :model-value="index === 0 ? dr.a : dr.b"
          :disabled-versions="[ index === 0 ? dr.b : dr.a ]"
          @update:model-value="id => index === 0 ? go(id, dr.b) : go(dr.a, id)"
        />
      </template>
    </VersionCompare>

    <DeltaSummary :dr="dr" />

    <NearbyDeltas provider="mcje" :groups="nearby" />
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
  margin-right: auto;
  margin-left: max(0px, calc(
    50% - var(--sidebar-width) / 2 - var(--overview-width) / 2 + var(--content-gutter) / 2
  ));
  padding-bottom: 40px;
}

</style>
