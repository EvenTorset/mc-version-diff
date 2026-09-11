<script setup lang="ts">
import { computed } from 'vue'
import type { ManifestVersion } from 'minecraft-asset-loader'
import { assetIndex } from './edition'
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
    <Dim>Index:</Dim>
    <div>{{ index.id }}</div>
  </Row>
</template>
