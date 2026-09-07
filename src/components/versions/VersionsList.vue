<script setup lang="ts">
import { ref } from 'vue'
import type { ManifestVersion } from 'minecraft-asset-loader'
import VersionBrowser, { VERSION_MODES, type VersionMode } from './VersionBrowser.vue'
import VersionModeTabs from '@/components/VersionModeTabs.vue'
import VersionSelect from '@/components/VersionSelect.vue'

const selectedVersions = defineModel<Set<ManifestVersion>>({ default: () => new Set() })

const mode = ref<VersionMode>('main')
const filter = ref('')
const select = ref<InstanceType<typeof VersionSelect> | null>(null)
</script>

<template>
  <VersionSelect ref="select" mode="menu" title="Versions" v-model:filter="filter">
    <template #tabs>
      <VersionModeTabs v-model="mode" :options="VERSION_MODES" />
    </template>
    <VersionBrowser
      v-model="selectedVersions"
      v-model:mode="mode"
      v-model:filter="filter"
      keep-pinned-while-filtering
      @select="select?.itemSelected()"
      @deselect="select?.itemSelected()"
    />
  </VersionSelect>
</template>
