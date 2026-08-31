<script setup lang="ts">
import { NAvatar, NSkeleton, NTime } from 'naive-ui'
import MCJEVersionNumber from '@/delta_providers/mcje/MCJEVersionNumber.vue'
import releaseVersionIcon from '@/assets/release_version.webp'
import snapshotVersionIcon from '@/assets/snapshot_version.webp'
import Tooltip from '@/components/Tooltip.vue'
import { mergeProps, ref, watch } from 'vue'
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

defineOptions({
  inheritAttrs: false
})

const manVer = ref<MCJEManifestVersion | null>(null)
const details = ref<MCJEVersionDetails | null>(null)

watch(() => props.version, async version => {
  details.value = null
  if (typeof version === 'string') {
    manVer.value = null
    const loaded = await getVersion(version)
    if (props.version === version) manVer.value = loaded
  } else {
    manVer.value = version
  }
}, { immediate: true })

async function loadDetails() {
  if (details.value === null) {
    details.value = await getVersionDetails(props.version)
  }
}
</script>

<template>
  <Tooltip v-if="manVer" @tooltip-open="loadDetails" :side="tooltipSide">
    <template #trigger="{ props }">
      <Row gap="8px" v-bind="mergeProps($attrs, props)">
        <NAvatar
          :src="manVer.type === 'release' ? releaseVersionIcon : snapshotVersionIcon"
          :img-props="{
            width: 20,
            height: 20,
            style: 'image-rendering: pixelated;'
          }"
        />
        <Col align="flex-start">
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
      <Row>
        <Dim>Size:</Dim>
        <template v-if="details">{{ formatBytes(details.downloads.client.size) }}</template>
        <NSkeleton v-else text width="64px" />
      </Row>
      <Row>
        <Dim>Asset index:</Dim>
        <template v-if="details">{{ details.assets }}</template>
        <NSkeleton v-else text width="24px" />
      </Row>
      <Row>
        <Dim>Type:</Dim>
        <template v-if="details">{{ details.type }}</template>
        <NSkeleton v-else text width="60px" />
      </Row>
    </p>
  </Tooltip>
</template>
