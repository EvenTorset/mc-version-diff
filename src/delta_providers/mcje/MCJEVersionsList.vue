<script setup lang="ts">
import { getVersionList, loadMCJEManifest, type MCJEManifestVersion } from '@/delta_providers/mcje/version_manifest.ts'
import { NButton, NCard, NIcon, NInput, NList, NListItem, NProgress, NSwitch, type InputInst } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Beaker16Filled, Eraser20Filled } from '@vicons/fluent'
import { useVirtualizer } from '@tanstack/vue-virtual'
import MCJEVersionDisplay from '@/delta_providers/mcje/MCJEVersionDisplay.vue'
import Tooltip from '@/components/Tooltip.vue'
import { ProgressHandler } from '@/util/progress.ts'
import Row from '@/components/Row.vue'
import Col from '@/components/Col.vue'

const loadingProgress = ref(0)
const showSnapshots = ref(true)
const snapshotsAndReleases = ref<MCJEManifestVersion[]>([])
const releasesOnly = ref<MCJEManifestVersion[]>([])
const versions = computed<MCJEManifestVersion[]>(() => {
  const base = showSnapshots.value ? snapshotsAndReleases.value : releasesOnly.value
  return base.filter(v => v.id.includes(debouncedFilter.value))
})
const selectedVersions = defineModel<Set<MCJEManifestVersion>>({ default: () => new Set() })

const parentRef = ref<HTMLElement | null>(null)

const rowVirtualizer = useVirtualizer({
  get count() {
    return versions.value.length
  },
  getScrollElement: () => parentRef.value,
  estimateSize: () => 60,
  overscan: 5,
})

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())

function toggle(version: MCJEManifestVersion) {
  if (selectedVersions.value.size >= 2 && !selectedVersions.value.has(version)) {
    return;
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
    snapshotsAndReleases.value = getVersionList()
    releasesOnly.value = snapshotsAndReleases.value.filter(v => v.type === 'release')
  } catch {
    // Errors with loading the manifest will be handled by the selector component.
  }
})

const filterInput = ref<InputInst | null>(null)
const filter = ref<string>('')
const debouncedFilter = ref<string>('')
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
      <Tooltip>
        <template #trigger="{ props }">
          <Row v-bind="props" @click="showSnapshots = !showSnapshots" style="cursor: pointer;">
            <NIcon :component="Beaker16Filled" :size="18" :color="showSnapshots ? 'var(--color-accent)' : 'var(--color-4)'" />
            <NSwitch size="small" v-model:value="showSnapshots" style="pointer-events: none;" />
          </Row>
        </template>
        Show snapshots
      </Tooltip>
    </template>
    <Col align="stretch" style="height: calc(100cqh - 30px)">
      <NInput
        clearable
        placeholder="Filter..."
        ref="filterInput"
        @vue:mounted="onFilterInputMounted"
        v-model:value="filter"
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
      <div v-else class="list-size-wrapper">
        <div ref="parentRef" class="list-container" :key="String(showSnapshots) + debouncedFilter">
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
                  v-if="showSnapshots || versions[virtualRow.index].type !== 'snapshot'"
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

.list-size-wrapper {
  flex: 1;
  container-type: size;
}

.list-container {
  max-height: 100cqh;
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
