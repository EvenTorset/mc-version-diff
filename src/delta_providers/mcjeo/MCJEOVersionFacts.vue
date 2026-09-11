<script setup lang="ts">
import { computed } from 'vue'
import type { ManifestVersion } from 'minecraft-asset-loader'
import { assetIndex, assetsRange } from './edition'
import { formatBytes } from '@/util/bytes'
import Dim from '@/components/Dim.vue'
import Row from '@/components/Row.vue'

const props = defineProps<{
  version: ManifestVersion
}>()

const index = computed(() => assetIndex(props.version))
</script>

<template>
  <Row>
    <Dim>Size:</Dim>
    <div>{{ formatBytes(index.totalSize) }}</div>
  </Row>

  <Row>
    <Dim>Versions:</Dim>
    <div>{{ assetsRange(version) }}</div>
  </Row>

  <Row>
    <Dim>Download:</Dim>
    <div>
      <a :href="index.url" rel="noreferrer" download>asset index</a>
    </div>
  </Row>
</template>
