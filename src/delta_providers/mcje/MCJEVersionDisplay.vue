<script setup lang="ts">
import { NAvatar, NTime } from 'naive-ui'
import MCJEVersionNumber from '@/delta_providers/mcje/MCJEVersionNumber.vue'
import releaseVersionIcon from '@/assets/release_version.webp'
import snapshotVersionIcon from '@/assets/snapshot_version.webp'
import Tooltip from '@/components/Tooltip.vue'
import { onMounted, ref } from 'vue'
import { getVersion, getVersionDetails, type MCJEManifestVersion, type MCJEVersionDetails } from '@/delta_providers/mcje/version_manifest.ts'
import Row from '@/components/Row.vue'
import Dim from '@/components/Dim.vue'
import { formatBytes } from '@/util/bytes'
import Col from '@/components/Col.vue'
import type { TooltipSide } from '@/types'

const props = withDefaults(defineProps<{
  version: MCJEManifestVersion | string
  brighter?: boolean
  tooltipSide?: TooltipSide
}>(), {
  tooltipSide: 'above',
})

const manVer = ref<MCJEManifestVersion | null>(null)
const details = ref<MCJEVersionDetails | null>(null)

onMounted(async () => {
  if (typeof props.version === 'string') {
    manVer.value = await getVersion(props.version)
  } else {
    manVer.value = props.version
  }
})

async function loadDetails() {
  if (details.value === null) {
    details.value = await getVersionDetails(props.version)
  }
}
</script>

<template>
  <Tooltip v-if="manVer" @tooltip-open="loadDetails" :side="tooltipSide">
    <template #trigger="{ props }">
      <Row gap="8px" v-bind="props">
        <NAvatar
          v-if="manVer.type === 'release'"
          :src="releaseVersionIcon"
          :img-props="{
            width: 20,
            height: 20,
            style: 'image-rendering: pixelated;'
          }"
        />
        <NAvatar
          v-else
          :src="snapshotVersionIcon"
          :img-props="{
            width: 20,
            height: 20,
            style: 'image-rendering: pixelated;'
          }"
        />
        <Col align="flex-start" gap="4px">
          <MCJEVersionNumber :id="manVer.id" style="font-size: 16px; line-height: 1;"/>
          <NTime
            :time="new Date(manVer.releaseTime)"
            :to="Date.now()"
            type="relative"
            class="faded"
            style="font-size: 14px; line-height: 1;"
          />
        </Col>
      </Row>
    </template>
    <h3>{{ manVer.id }}</h3>
    <p>
      <Row>
        <Dim>Released:</Dim>
        <NTime :time="new Date(manVer.releaseTime)" />
      </Row>
      <template v-if="details !== null">
        <Row>
          <Dim>Size:</Dim>
          {{ formatBytes(details.downloads.client.size) }}
        </Row>
        <Row>
          <Dim>Asset index:</Dim>
          {{ details.assets }}
        </Row>
        <Row>
          <Dim>Type:</Dim>
          {{ details.type }}
        </Row>
      </template>
    </p>
  </Tooltip>
</template>
