<script setup lang="ts">
import { formatBytes } from '@/util/bytes'
import { ref } from 'vue'
import { onMounted } from 'vue'
import { getVersion, getVersionDetails, type MCJEManifestVersion, type MCJEVersionDetails } from './version_manifest'
import { getPackFormats, type PackFormats } from './pack_formats'
import Dim from '@/components/Dim.vue'
import Row from '@/components/Row.vue'
import Tooltip from '@/components/Tooltip.vue'
import { NTime } from 'naive-ui'

const props = defineProps<{
  id: string
  formatNumbers?: boolean
}>()

const version = ref<MCJEManifestVersion | null>(null)
const details = ref<MCJEVersionDetails>()
const packs = ref<PackFormats | null>(null)

onMounted(async () => {
  version.value = await getVersion(props.id)
  details.value = await getVersionDetails(props.id)
  packs.value = getPackFormats(props.id)
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
        <Dim>Size:</Dim>
        <div>{{ formatBytes(details.downloads.client.size) }}</div>
      </Row>

      <Row>
        <Dim>Asset index:</Dim>
        <div>{{ details.assetIndex.id }}</div>
      </Row>

      <template v-if="formatNumbers">
        <Row v-if="packs?.resource">
          <Dim>Resource format:</Dim>
          <div>{{ packs.resource }}</div>
        </Row>

        <Row v-if="packs?.data">
          <Dim>Data format:</Dim>
          <div>{{ packs.data }}</div>
        </Row>
      </template>

      <Row>
        <Dim>Type:</Dim>
        <div>{{ version.type }}</div>
      </Row>

      <Row>
        <Dim>Download:</Dim>
        <div>
          <a
            :href="details.downloads.client.url"
            rel="noreferrer"
            download
          >client</a><template v-if="details.downloads.server"><Dim>, </Dim><a
            :href="details.downloads.server.url"
            rel="noreferrer"
            download
          >server</a></template>
        </div>
      </Row>

      <Row v-if="$slots.default" justify="center" style="margin-top: 8px;">
        <slot></slot>
      </Row>
    </div>
  </div>
</template>
