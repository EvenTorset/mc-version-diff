<script setup lang="ts">
import { computed } from 'vue'
import type { ManifestVersion, VersionDetails } from 'minecraft-asset-loader'
import { zipSize } from './edition'
import { formatBytes } from '@/util/bytes'
import Dim from '@/components/Dim.vue'
import Row from '@/components/Row.vue'

const props = defineProps<{
  version: ManifestVersion
  details: VersionDetails | null
}>()

const size = computed(() => zipSize(props.version, props.details))
</script>

<template>
  <Row v-if="size !== null">
    <Dim>Size:</Dim>
    {{ formatBytes(size) }}
  </Row>
</template>
