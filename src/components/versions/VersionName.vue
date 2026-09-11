<script setup lang="ts">
import { computed } from 'vue'
import type { ManifestVersion } from 'minecraft-asset-loader'
import VersionNumber from './VersionNumber.vue'
import { useEdition } from './edition'

const props = defineProps<{
  version: ManifestVersion
}>()

const edition = useEdition()

const tag = computed(() => edition.tag?.(props.version) ?? null)
</script>

<template>
  <span class="version-name">
    <VersionNumber :id="version.id" />
    <span v-if="tag" class="version-tag">{{ tag }}</span>
  </span>
</template>

<style lang="scss" scoped>

.version-name {
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
}

.version-tag {
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--color-2);
  background-color: rgb(from var(--color-2) r g b / 0.5);
  color: var(--color-5);
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  white-space: nowrap;
}

</style>
