<script setup lang="ts">
import { computed } from 'vue'
import type { ManifestVersion, VersionDetails } from 'minecraft-asset-loader'
import type { MCJEVersionDetails } from './edition'
import { getPackFormats } from './pack_formats'
import { formatBytes } from '@/util/bytes'
import Dim from '@/components/Dim.vue'
import Row from '@/components/Row.vue'

const props = defineProps<{
  version: ManifestVersion
  details: VersionDetails
}>()

const java = computed(() => props.details as MCJEVersionDetails)
const packs = computed(() => getPackFormats(props.version.id))
</script>

<template>
  <Row>
    <Dim>Size:</Dim>
    <div>{{ formatBytes(java.downloads.client.size) }}</div>
  </Row>

  <Row>
    <Dim>Asset index:</Dim>
    <div>{{ java.assetIndex.id }}</div>
  </Row>

  <Row v-if="packs?.resource">
    <Dim>Resource format:</Dim>
    <div>{{ packs.resource }}</div>
  </Row>

  <Row v-if="packs?.data">
    <Dim>Data format:</Dim>
    <div>{{ packs.data }}</div>
  </Row>

  <Row>
    <Dim>Download:</Dim>
    <div>
      <a
        :href="java.downloads.client.url"
        rel="noreferrer"
        download
      >client</a><template v-if="java.downloads.server"><Dim>, </Dim><a
        :href="java.downloads.server.url"
        rel="noreferrer"
        download
      >server</a></template>
    </div>
  </Row>
</template>
