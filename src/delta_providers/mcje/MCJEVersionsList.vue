<script setup lang="ts">
import { getVersionList, loadMCJEManifest, type MCJEManifestVersion } from '@/delta_providers/mcje/version_manifest.ts'
import { NButton, NCard, NInput, NList, NListItem, NProgress, NRadioButton, NRadioGroup, type InputInst } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Eraser20Filled } from '@vicons/fluent'
import { useVirtualizer } from '@tanstack/vue-virtual'
import MCJEVersionDisplay from '@/delta_providers/mcje/MCJEVersionDisplay.vue'
import Tooltip from '@/components/Tooltip.vue'
import { ProgressHandler } from '@/util/progress.ts'
import Col from '@/components/Col.vue'

type VersionMode = 'main' | 'releases' | 'all'

const ROW_HEIGHT = 60

const loadingProgress = ref(0)
const versionMode = ref<VersionMode>('main')
const allVersions = ref<MCJEManifestVersion[]>([])
const releasesOnly = ref<MCJEManifestVersion[]>([])
const debouncedFilter = ref<string>('')

const MAIN_EXTRA = new Set([
  '1.20.4', '1.20.6',
  '1.21.3', '1.21.4', '1.21.5', '1.21.8', '1.21.10', '1.21.11',
])

const mainVersions = computed<MCJEManifestVersion[]>(() => {
  const releases = releasesOnly.value
  const lines = new Set<string>()
  const picked: MCJEManifestVersion[] = []
  for (const release of releases) {
    const line = release.id.split('.').slice(0, 2).join('.')
    const latestOfLine = !lines.has(line)
    lines.add(line)
    if (latestOfLine || MAIN_EXTRA.has(release.id)) picked.push(release)
  }

  const snapshot = allVersions.value.find(v => v.type === 'snapshot')
  if (snapshot && (!releases[0] || snapshot.releaseTime > releases[0].releaseTime)) {
    picked.unshift(snapshot)
  }
  return picked
})

const listForMode = computed<MCJEManifestVersion[]>(() => {
  if (versionMode.value === 'all') return allVersions.value
  if (versionMode.value === 'releases') return releasesOnly.value
  return mainVersions.value
})

function matching(list: MCJEManifestVersion[], query: string) {
  const starts: MCJEManifestVersion[] = []
  const contains: MCJEManifestVersion[] = []
  for (const version of list) {
    if (version.id.startsWith(query)) starts.push(version)
    else if (version.id.includes(query)) contains.push(version)
  }
  return starts.concat(contains)
}

const selectedVersions = defineModel<Set<MCJEManifestVersion>>({ default: () => new Set() })

const selectedIds = computed(() => new Set([ ...selectedVersions.value ].map(v => v.id)))

const selectedList = computed<MCJEManifestVersion[]>(() =>
  allVersions.value.filter(v => selectedIds.value.has(v.id)))

const versions = computed<MCJEManifestVersion[]>(() =>
  matching(listForMode.value, debouncedFilter.value).filter(v => !selectedIds.value.has(v.id)))

const otherMatches = computed(() => {
  if (versionMode.value === 'all' || !debouncedFilter.value) return 0
  return matching(allVersions.value, debouncedFilter.value).length - versions.value.length
})

const parentRef = ref<HTMLElement | null>(null)

const rowVirtualizer = useVirtualizer({
  get count() {
    return versions.value.length
  },
  getScrollElement: () => parentRef.value,
  estimateSize: () => ROW_HEIGHT,
  overscan: 5,
})

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())

const REFOCUS_WINDOW = 500
let filterBlurredAt = 0
function onFilterBlur() {
  filterBlurredAt = performance.now()
}

function toggle(version: MCJEManifestVersion) {
  if (selectedVersions.value.size >= 2 && !selectedVersions.value.has(version)) {
    return;
  }
  const stillFocused = filterInput.value?.inputElRef === document.activeElement
  if (stillFocused || performance.now() - filterBlurredAt < REFOCUS_WINDOW) {
    nextTick(() => filterInput.value?.focus())
  }
  if (selectedVersions.value.has(version)) {
    const set = new Set(selectedVersions.value)
    set.delete(version)
    selectedVersions.value = set
  } else {
    selectedVersions.value = new Set([
      ...selectedVersions.value,
      version
    ].sort((a, b) => new Date(a.releaseTime).valueOf() - new Date(b.releaseTime).valueOf()))
  }
}

onMounted(async () => {
  try {
    await loadMCJEManifest(new ProgressHandler(p => {
      loadingProgress.value = Number((p.ratio * 100).toFixed(1))
    }))
    allVersions.value = getVersionList()
    releasesOnly.value = allVersions.value.filter(v => v.type === 'release')
  } catch {
    // Errors with loading the manifest will be handled by the selector component.
  }
})

const filterInput = ref<InputInst | null>(null)
const filter = ref<string>('')
let debounceTimer: ReturnType<typeof setTimeout> | undefined

watch(filter, (newVal) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedFilter.value = newVal
  }, 150)
})

function onKeydown(event: KeyboardEvent) {
  if (
    (event.ctrlKey || event.metaKey)
    && event.key.toLowerCase() === 'f'
    && filterInput.value?.inputElRef !== document.activeElement
  ) {
    event.preventDefault()
    filterInput.value?.select()
  }
}

function onFilterInputMounted() {
  window.addEventListener('keydown', onKeydown)
}

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <NCard class="card" title="Versions">
    <template #header-extra>
      <div class="mode-group">
        <NRadioGroup v-model:value="versionMode" size="small">
          <NRadioButton value="main">Main</NRadioButton>
          <NRadioButton value="releases">Releases</NRadioButton>
          <NRadioButton value="all">All</NRadioButton>
        </NRadioGroup>
      </div>
    </template>
    <Col align="stretch" style="height: calc(100cqh - 30px)">
      <NInput
        clearable
        placeholder="Filter..."
        ref="filterInput"
        @vue:mounted="onFilterInputMounted"
        v-model:value="filter"
        @blur="onFilterBlur"
        style="margin: 0 4px; width: calc(100% - 8px);"
      >
        <template #clear-icon>
          <Tooltip>
            <template #trigger="{ props }">
              <NButton v-bind="props" class="icon" circle size="small">
                <template #icon>
                  <Eraser20Filled />
                </template>
              </NButton>
            </template>
            Clear
          </Tooltip>
        </template>
      </NInput>
      <NProgress
        v-if="loadingProgress < 100"
        type="circle"
        processing
        :percentage="loadingProgress"
      ></NProgress>
      <div v-else class="list-area">
      <div v-if="selectedList.length > 0" class="pinned">
          <NList hoverable clickable :show-divider="false">
            <template v-for="version of selectedList" :key="version.id">
              <NListItem
                  :style="{ height: `${ROW_HEIGHT}px` }"
                  @click="toggle(version)"
                  class="mcje-version-list-item"
                  :class="{ selected: true }"
                >
                  <MCJEVersionDisplay
                    :version="version"
                    tooltip-side="right"
                    :style="{
                      padding: '12px 12px 12px 16px',
                      margin: '-12px -12px -12px -16px',
                    }"
                  />
                </NListItem>
            </template>
        </NList>
      </div>
      <div v-if="versions.length === 0" class="no-results">
        No {{ versionMode === 'releases' ? 'releases' : 'versions' }} match that filter.
        <button v-if="otherMatches > 0" class="show-hidden" @click="versionMode = 'all'">
          {{ otherMatches }} other match{{ otherMatches === 1 ? '' : 'es' }}
        </button>
      </div>
      <div v-else class="list-size-wrapper">
        <div ref="parentRef" class="list-container" :key="versionMode + debouncedFilter">
          <div
            :style="{
              height: `${totalSize}px`,
              width: '100%',
              position: 'relative',
            }"
          >
            <NList hoverable clickable>
              <template v-for="virtualRow in virtualRows" :key="String(virtualRow.key)">
                <NListItem
                  :style="{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }"
                  @click="toggle(versions[virtualRow.index])"
                  class="mcje-version-list-item"
                  :class="{
                    selected: selectedVersions.has(versions[virtualRow.index]),
                    disabled: !selectedVersions.has(versions[virtualRow.index]) && selectedVersions.size >= 2
                  }"
                >
                  <MCJEVersionDisplay
                    :version="versions[virtualRow.index]"
                    tooltip-side="right"
                    :style="{
                      padding: '12px 12px 12px 16px',
                      margin: '-12px -12px -12px -16px',
                    }"
                  />
                </NListItem>
              </template>
            </NList>
          </div>
          <button v-if="otherMatches > 0" class="show-hidden" @click="versionMode = 'all'">
            {{ otherMatches }} other match{{ otherMatches === 1 ? '' : 'es' }}
          </button>
        </div>
      </div>
      </div>
    </Col>
  </NCard>
</template>

<style lang="scss" scoped>

.card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  max-height: 100dvh;
  height: 100%;
  max-height: 100%;
  container-type: size;
}

.card :deep(.n-card-content) {
  padding: 0 !important;
}

.mode-group {
  display: flex;
  white-space: nowrap;
  border: 1px solid var(--color-2);
  border-radius: 3px;
  overflow: hidden;

  :deep(.n-radio-button) {
    height: 20px;
    padding: 0 8px;
    font-size: 12px;
    line-height: 20px;
    color: var(--color-4);
    background: transparent;
    border: none;
    border-radius: 0;
    text-align: center;
    user-select: none;

    &:hover {
      color: var(--color-5);
    }
  }

  :deep(.n-radio-button--checked) {
    background: var(--color-accent);
    color: var(--color-6);
  }

  :deep(.n-radio-button__state-border) {
    display: none;
  }

  :deep(.n-radio-group__splitor) {
    width: 1px;
    height: auto;
    align-self: stretch;
    background: var(--color-2);
  }
}

.no-results {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 16px;
  text-align: center;
  font-size: 14px;
  color: var(--color-dim);
}

.show-hidden {
  display: block;
  width: 100%;
  padding: 8px 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 12px;
  color: var(--color-accent);
  text-decoration: underline;
  cursor: pointer;
  user-select: none;
}

.list-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.pinned {
  flex: none;
}

.list-size-wrapper {
  display: flex;
  flex-direction: column;
  flex: 0 1 auto;
  min-height: 0;
}

.list-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
}

.disabled {
  opacity: 0.5;
  pointer-events: none;
}

</style>

<style lang="scss">
@use '@/util/gradients.scss' as gradients;

.mcje-version-list-item {
  --intr-color: transparent;
  --intr-color-fade: color-mix(
    in oklch,
    var(--intr-color),
    oklch(from var(--intr-color) l calc(max(c, 0.2) * 2) var(--hue-cold))
  );
  --intr-gradient-start: rgb(from var(--intr-color) r g b / calc(alpha * 0.75));
  --intr-gradient-end-alpha: 0.1;
  --intr-gradient-end: rgb(from var(--intr-color-fade) r g b / calc(alpha * var(--intr-gradient-end-alpha)));
  --intr-gradient-size: farthest-corner;
  --intr-gradient-x: 100%;
  --intr-gradient-y: 100%;
  --intr-gradient-start_internal: var(--intr-gradient-start);
  --intr-gradient-end_internal: var(--intr-gradient-end);
  background-image: radial-gradient(
    var(--intr-gradient-size) at var(--intr-gradient-x) var(--intr-gradient-y) in oklch,
    gradients.scrim(var(--intr-gradient-start_internal), var(--intr-gradient-end_internal))
  );
  background-color: transparent !important;
  transition:
    --intr-gradient-start_internal 100ms,
    --intr-gradient-end_internal 100ms,
    --intr-gradient-size 100ms,
    --intr-gradient-x 100ms,
    --intr-gradient-y 100ms,
    box-shadow 200ms,
    color 200ms !important;
  text-shadow: 0 1px 2px #000;
  user-select: none;

  .n-list-item__main {
    color: var(--color-5);
    transition: color 200ms;
  }

  .faded {
    color: var(--color-4);
    transition: color 200ms;
  }

  &:hover {
    --intr-color: rgb(from var(--color-accent) r g b / calc(alpha * 0.5));

    .n-list-item__main {
      color: var(--color-6);
    }

    .faded {
      color: var(--color-5);
    }
  }

  &.selected {
    --intr-color: oklch(from var(--color-accent) l calc(c * 1.3) h);

    .n-list-item__main {
      color: var(--color-6);
    }

    .faded {
      color: var(--color-5);
    }

    &:hover {
      .n-list-item__main {
        color: var(--color-7);
      }

      .faded {
        color: var(--color-6);
      }
    }
  }
}

</style>
