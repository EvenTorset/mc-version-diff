<script setup lang="ts">
import { NAvatar, NTime } from 'naive-ui'
import type { ManifestVersion, VersionDetails } from 'minecraft-asset-loader'
import VersionNumber from './VersionNumber.vue'
import releaseVersionIcon from '@/assets/release_version.webp'
import snapshotVersionIcon from '@/assets/snapshot_version.webp'
import Tooltip from '@/components/Tooltip.vue'
import { mergeProps, ref, watch } from 'vue'
import Row from '@/components/Row.vue'
import Dim from '@/components/Dim.vue'
import Col from '@/components/Col.vue'
import type { TooltipSide } from '@/types'
import { findVersion } from '@/delta_providers/manifest'
import { typeName, useEdition } from './edition'

const props = withDefaults(defineProps<{
  version: ManifestVersion | string
  brighter?: boolean
  tooltipSide?: TooltipSide
}>(), {
  tooltipSide: 'above',
})

defineOptions({
  inheritAttrs: false
})

const edition = useEdition()
const manVer = ref<ManifestVersion | null>(null)
const details = ref<VersionDetails | null>(null)

watch(() => props.version, async version => {
  details.value = null
  if (typeof version === 'string') {
    manVer.value = null
    const loaded = await findVersion(edition.assets, version)
    if (props.version === version) manVer.value = loaded
  } else {
    manVer.value = version
  }
}, { immediate: true })

async function loadDetails() {
  if (details.value === null && manVer.value) {
    details.value = await manVer.value.details()
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
          <VersionNumber :id="manVer.id" style="font-size: 16px; line-height: 1;"/>
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
      <component :is="edition.tooltip" v-if="edition.tooltip" :version="manVer" :details="details" />
      <Row>
        <Dim>Type:</Dim>
        {{ typeName(edition, manVer.type) }}
      </Row>
    </p>
  </Tooltip>
</template>
