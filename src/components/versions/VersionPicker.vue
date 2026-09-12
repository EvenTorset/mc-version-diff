<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue'
import type { ManifestVersion } from 'minecraft-asset-loader'
import VersionBrowser, { VERSION_MODES, type VersionMode } from './VersionBrowser.vue'
import VersionModeTabs from '@/components/VersionModeTabs.vue'
import VersionSelect from '@/components/VersionSelect.vue'
import VersionName from './VersionName.vue'
import { findVersion } from '@/delta_providers/manifest'
import { EDITION, type Edition, versionLabel } from './edition'

const props = defineProps<{
  edition: Edition
  modelValue: string
  disabledVersions?: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [id: string]
}>()

provide(EDITION, props.edition)

const open = ref(false)
const filter = ref('')
const mode = ref<VersionMode>('main')
const current = ref<ManifestVersion | null>(null)

const selection = computed({
  get: () => new Set(current.value ? [ current.value ] : []),
  set: versions => {
    const [ version ] = versions
    if (version) current.value = version
  },
})

async function sync(id: string) {
  current.value = await findVersion(props.edition.assets, id)
}

onMounted(() => sync(props.modelValue))
watch(() => props.modelValue, sync)

const label = computed(() => current.value ? versionLabel(props.edition, current.value) : props.modelValue)

const select = ref<InstanceType<typeof VersionSelect> | null>(null)

function onSelect(version: ManifestVersion) {
  select.value?.itemSelected()
  if (version.id !== props.modelValue) emit('update:modelValue', version.id)
}
</script>

<template>
  <VersionSelect
    ref="select"
    mode="popover"
    title="Versions"
    v-model:open="open"
    v-model:filter="filter"
    :label="label || undefined"
    :placeholder="modelValue ? undefined : 'Choose a version'"
  >
    <template #label v-if="current">
      <VersionName :version="current" />
    </template>
    <template #tabs>
      <VersionModeTabs v-model="mode" :options="VERSION_MODES" />
    </template>
    <VersionBrowser
      v-model="selection"
      v-model:mode="mode"
      v-model:filter="filter"
      :max="1"
      :disabled-versions="disabledVersions"
      @select="onSelect"
    />
  </VersionSelect>
</template>
