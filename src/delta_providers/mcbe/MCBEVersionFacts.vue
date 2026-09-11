<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { ManifestVersion, VersionDetails } from 'minecraft-asset-loader'
import { formatBytes } from '@/util/bytes'
import Dim from '@/components/Dim.vue'
import Row from '@/components/Row.vue'
import { archiveUrl, knownZipSize, releaseAssets } from './util'

const props = defineProps<{
  version: ManifestVersion
  details: VersionDetails
}>()

const size = ref<number | null | undefined>(undefined)
const assets = computed(() => releaseAssets(props.details))
const archive = computed(() => assets.value.length ? null : archiveUrl(props.version))

onMounted(async () => {
  size.value = await knownZipSize(props.version, props.details)
})
</script>

<template>
  <Row v-if="size !== undefined">
    <Dim>Size:</Dim>
    <div v-if="size !== null">{{ formatBytes(size) }}</div>
    <Dim v-else>unknown</Dim>
  </Row>

  <Row v-if="assets.length">
    <Dim>Download:</Dim>
    <div>
      <template v-for="asset, i in assets" :key="asset.name">
        <Dim v-if="i > 0">, </Dim><a
          :href="asset.browser_download_url"
          rel="noreferrer"
          download
        >{{ asset.name.replace(/^bedrock-samples-v[^-]+-|\.zip$/g, '') }}</a>
      </template>
    </div>
  </Row>
  <Row v-else-if="archive">
    <Dim>Download:</Dim>
    <div><a :href="archive" rel="noreferrer" download>source</a></div>
  </Row>
</template>
