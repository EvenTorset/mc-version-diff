<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { getVersion, type MCJEManifestVersion } from '@/delta_providers/mcje/version_manifest.ts'
import MCJEVersionBrowser, { VERSION_MODES, type VersionMode } from './MCJEVersionBrowser.vue'
import VersionModeTabs from '@/components/VersionModeTabs.vue'
import VersionSelect from '@/components/VersionSelect.vue'

const props = defineProps<{
  modelValue: string
  disabledVersions?: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [id: string]
}>()

const open = ref(false)
const filter = ref('')
const mode = ref<VersionMode>('main')
const current = ref<MCJEManifestVersion | null>(null)

const selection = computed({
  get: () => new Set(current.value ? [ current.value ] : []),
  set: versions => {
    const [ version ] = versions
    if (version) current.value = version
  },
})

async function sync(id: string) {
  current.value = await getVersion(id)
}

onMounted(() => sync(props.modelValue))
watch(() => props.modelValue, sync)

const select = ref<InstanceType<typeof VersionSelect> | null>(null)

function onSelect(version: MCJEManifestVersion) {
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
    :label="modelValue"
  >
    <template #tabs>
      <VersionModeTabs v-model="mode" :options="VERSION_MODES" />
    </template>
    <MCJEVersionBrowser
      v-model="selection"
      v-model:mode="mode"
      v-model:filter="filter"
      :max="1"
      :disabled-versions="disabledVersions"
      @select="onSelect"
    />
  </VersionSelect>
</template>
