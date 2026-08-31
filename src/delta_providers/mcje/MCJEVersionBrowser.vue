<script lang="ts">
export type VersionMode = 'main' | 'releases' | 'all'

export const VERSION_MODES: { value: VersionMode, label: string }[] = [
  { value: 'main', label: 'Main' },
  { value: 'releases', label: 'Releases' },
  { value: 'all', label: 'All' },
]
</script>

<script setup lang="ts">
import { getVersionList, loadMCJEManifest, type MCJEManifestVersion } from '@/delta_providers/mcje/version_manifest.ts'
import { NList, NListItem, NProgress } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import MCJEVersionDisplay from '@/delta_providers/mcje/MCJEVersionDisplay.vue'
import { ProgressHandler } from '@/util/progress.ts'
import Col from '@/components/Col.vue'

const props = withDefaults(defineProps<{
  max?: number
  disabledVersions?: string[]
  keepPinnedWhileFiltering?: boolean
}>(), {
  max: 2,
  disabledVersions: () => [],
  keepPinnedWhileFiltering: false,
})

const emit = defineEmits<{
  select: [version: MCJEManifestVersion]
  deselect: [version: MCJEManifestVersion]
}>()

const ROW_HEIGHT = 60

const loadingProgress = ref(0)
const allVersions = ref<MCJEManifestVersion[]>([])
const releasesOnly = ref<MCJEManifestVersion[]>([])
const debouncedFilter = ref<string>('')

const versionMode = defineModel<VersionMode>('mode', { default: 'main' })
const filter = defineModel<string>('filter', { default: '' })
const selectedVersions = defineModel<Set<MCJEManifestVersion>>({ default: () => new Set() })

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

const selectedIds = computed(() => new Set([ ...selectedVersions.value ].map(v => v.id)))

const selectedList = computed<MCJEManifestVersion[]>(() => {
  const pinned = allVersions.value.filter(v => selectedIds.value.has(v.id))
  if (props.keepPinnedWhileFiltering || !debouncedFilter.value) return pinned
  return matching(pinned, debouncedFilter.value)
})

const versions = computed<MCJEManifestVersion[]>(() =>
  matching(listForMode.value, debouncedFilter.value).filter(v => !selectedIds.value.has(v.id)))

const otherMatches = computed(() => {
  if (versionMode.value === 'all' || !debouncedFilter.value) return 0
  const all = matching(allVersions.value, debouncedFilter.value)
    .filter(v => !selectedIds.value.has(v.id))
  return all.length - versions.value.length
})

const parentRef = ref<HTMLElement | null>(null)

const pinnedHeight = computed(() => selectedList.value.length * ROW_HEIGHT)

const rowVirtualizer = useVirtualizer({
  get count() {
    return versions.value.length
  },
  get scrollMargin() {
    return pinnedHeight.value
  },
  getScrollElement: () => parentRef.value,
  estimateSize: () => ROW_HEIGHT,
  overscan: 5,
})

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())

const full = computed(() => props.max > 1 && selectedVersions.value.size >= props.max)

const disabledIds = computed(() => new Set(props.disabledVersions))

function toggle(version: MCJEManifestVersion) {
  if (disabledIds.value.has(version.id)) return
  if (props.max === 1) {
    selectedVersions.value = new Set([ version ])
    emit('select', version)
    return
  }
  if (full.value && !selectedVersions.value.has(version)) return

  if (selectedVersions.value.has(version)) {
    const set = new Set(selectedVersions.value)
    set.delete(version)
    selectedVersions.value = set
    emit('deselect', version)
  } else {
    selectedVersions.value = new Set([
      ...selectedVersions.value,
      version
    ].sort((a, b) => new Date(a.releaseTime).valueOf() - new Date(b.releaseTime).valueOf()))
    emit('select', version)
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

let debounceTimer: ReturnType<typeof setTimeout> | undefined

watch(filter, (newVal) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedFilter.value = newVal
  }, 150)
})

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
})
</script>

<template>
  <Col align="stretch" class="browser">
    <NProgress
      v-if="loadingProgress < 100"
      type="circle"
      processing
      :percentage="loadingProgress"
    ></NProgress>
    <div v-else ref="parentRef" class="list-container" :key="versionMode + debouncedFilter">
      <div v-if="selectedList.length > 0" class="pinned">
        <NList hoverable clickable :show-divider="false">
          <template v-for="version of selectedList" :key="version.id">
            <NListItem
              :style="{ height: `${ROW_HEIGHT}px` }"
              @click="toggle(version)"
              class="mcje-version-list-item selected"
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
      <template v-else>
        <div
          :style="{
            height: `${totalSize}px`,
            width: '100%',
            position: 'relative',
          }"
        >
            <NList hoverable clickable>
              <template v-for="virtualRow in virtualRows" :key="versions[virtualRow.index].id">
                <NListItem
                  :style="{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start - pinnedHeight}px)`,
                  }"
                  @click="toggle(versions[virtualRow.index])"
                  class="mcje-version-list-item"
                  :class="{ disabled: full || disabledIds.has(versions[virtualRow.index].id) }"
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
      </template>
    </div>
  </Col>
</template>

<style lang="scss" scoped>

.browser {
  flex: 1 1 auto;
  min-height: 0;
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

.pinned {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-1);
}

.list-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
}


</style>

<style lang="scss">
@use '@/util/gradients.scss' as gradients;

.mcje-version-list-item {
  @include gradients.interactive-surface;
  --intr-gradient-x: 100%;
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

  &:not(.disabled):hover {
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

.n-list .mcje-version-list-item.disabled {
  cursor: not-allowed;

  .n-list-item__main {
    opacity: 0.5;
    pointer-events: none;
  }

  &:hover .n-list-item__divider {
    background-color: var(--n-merged-border-color);
  }
}

</style>
