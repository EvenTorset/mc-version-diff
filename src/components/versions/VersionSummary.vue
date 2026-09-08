<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { ManifestVersion, VersionDetails } from 'minecraft-asset-loader'
import { NTime } from 'naive-ui'
import Dim from '@/components/Dim.vue'
import Row from '@/components/Row.vue'
import Tooltip from '@/components/Tooltip.vue'
import { findVersion } from '@/delta_providers/manifest'
import { useEdition } from './edition'

const props = defineProps<{
  id: string
}>()

const edition = useEdition()
const version = ref<ManifestVersion | null>(null)
const details = ref<VersionDetails | null>(null)

onMounted(async () => {
  version.value = await findVersion(edition.assets, props.id)
  details.value = await version.value?.details() ?? null
})
</script>

<template>
  <div v-if="version && details">
    <h2>{{ version.id }}</h2>
    <div>
      <Row>
        <Dim>Released:</Dim>
        <div>
          <Tooltip>
            <template #trigger="{ props }">
              <NTime v-bind="props" :time="new Date(version.releaseTime)" :to="Date.now()" type='relative' />
            </template>
            <NTime :time="new Date(version.releaseTime)" />
          </Tooltip>
        </div>
      </Row>

      <Row>
        <Dim>Type:</Dim>
        <div>{{ version.type }}</div>
      </Row>

      <component :is="edition.summary" v-if="edition.summary" :version="version" :details="details" />

      <Row v-if="$slots.default" justify="center" style="margin-top: 8px;">
        <slot></slot>
      </Row>
    </div>
  </div>
</template>
