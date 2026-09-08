<script setup lang="ts">
import { computed } from 'vue'
import { NSkeleton } from 'naive-ui'
import type { ManifestVersion, VersionDetails } from 'minecraft-asset-loader'
import type { MCJEVersionDetails } from './edition'
import { formatBytes } from '@/util/bytes'
import Dim from '@/components/Dim.vue'
import Row from '@/components/Row.vue'

const props = defineProps<{
  version: ManifestVersion
  details: VersionDetails | null
}>()

const java = computed(() => props.details as MCJEVersionDetails | null)
</script>

<template>
  <Row>
    <Dim>Size:</Dim>
    <template v-if="java">{{ formatBytes(java.downloads.client.size) }}</template>
    <NSkeleton v-else text width="64px" />
  </Row>
  <Row>
    <Dim>Asset index:</Dim>
    <template v-if="java">{{ java.assets }}</template>
    <NSkeleton v-else text width="24px" />
  </Row>
</template>
