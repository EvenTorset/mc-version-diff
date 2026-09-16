<script setup lang="ts">
import VersionsList from './VersionsList.vue'
import Row from '@/components/Row.vue'
import Spacer from '@/components/Spacer.vue'
import VersionDisplay from './VersionDisplay.vue'
import SelectedVersions from './SelectedVersions.vue'
import type { ManifestVersion } from 'minecraft-asset-loader'
import { getDiffSuggestions } from '@/delta_providers/manifest'
import { manifestUpdated } from '@/delta_providers/loader'
import { EDITION, type Edition } from './edition'
import { ArrowLeft24Regular, ArrowRight24Regular } from '@vicons/fluent'
import { NAlert, NButton, NCard, NIcon, NSkeleton } from 'naive-ui'
import { computed, onMounted, provide, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Col from '@/components/Col.vue'
import Content from '@/components/Content.vue'

const props = defineProps<{
  edition: Edition
}>()

provide(EDITION, props.edition)

const diffSuggestions = ref<[string, ManifestVersion[]][]>([])
const selectedVersions = ref<Set<ManifestVersion>>(new Set())
const ab = computed(() => {
  const [ a, b ] = Array.from(selectedVersions.value)
  return {
    a: a?.id,
    b: b?.id,
  }
})
const errorMessage = ref<string | null>(null)
const loading = ref(true)

async function loadSuggestions() {
  try {
    const suggestions = await getDiffSuggestions(props.edition)
    diffSuggestions.value = []
    function add(label: string, pair: [ManifestVersion, ManifestVersion] | null) {
      if (pair === null) return;
      if (diffSuggestions.value.some(([ , shown ]) => shown[0].id === pair[0].id && shown[1].id === pair[1].id)) return;
      diffSuggestions.value.push([label, pair])
    }
    if (suggestions.latestIsRelease) {
      add('Major release', suggestions.majorRelease)
      add('Release patches', suggestions.releasePatches)
      add('Latest version', suggestions.latestVersion)
    } else {
      add('Latest version', suggestions.latestVersion)
      add('Since release', suggestions.sinceRelease)
      add('Major release', suggestions.majorRelease)
      add('Release patches', suggestions.releasePatches)
    }
  } catch (err: any) {
    errorMessage.value = err?.message ?? err?.toString?.() ?? 'n/a'
  } finally {
    loading.value = false
  }
}

onMounted(loadSuggestions)
watch(manifestUpdated, loadSuggestions)

const route = useRoute()
const router = useRouter()

function queryIds() {
  return [ route.query.a, route.query.b ].filter((id): id is string => typeof id === 'string')
}

async function selectFromQuery() {
  const ids = queryIds()
  if (ids.join() === Array.from(selectedVersions.value, v => v.id).join()) return;
  const versions = await props.edition.assets.manifest.versions()
  selectedVersions.value = new Set(ids.map(id => versions.find(v => v.id === id)).filter(v => v !== undefined))
}

onMounted(selectFromQuery)
watch(queryIds, selectFromQuery)

watch(selectedVersions, () => {
  const [ a, b ] = Array.from(selectedVersions.value, v => v.id)
  if (queryIds().join() === [ a, b ].filter(id => id).join()) return;
  router.replace({ query: { ...route.query, a, b } })
}, { deep: true })
</script>

<template>
  <NAlert v-if="errorMessage !== null" title="Error" type="error" style="width: 600px;">
    <p>An error occurred while loading the version manifest.</p>
    <p>{{ errorMessage }}</p>
  </NAlert>
  <Row v-else align="stretch" style="height: 100%;">
    <div class="versions-list-wrapper">
      <VersionsList v-model="selectedVersions" />
    </div>
    <Col align="stretch" class="main-panel">
      <Transition name="rise">
        <NCard v-if="edition.description && selectedVersions.size === 0" size="small" class="edition-description"><p><Content :content="edition.description" /></p></NCard>
      </Transition>
      <NCard class="suggestions-card" :title="selectedVersions.size === 0 ? 'Comparison Suggestions' : 'Selected Versions'">
        <Transition name="rise">
        <div v-if="selectedVersions.size === 0" class="suggestions-grid">
        <template v-if="loading">
          <template v-for="i in 3" :key="`placeholder-${i}`">
            <div class="suggestion-placeholder" :style="{ '--row': (i - 1) * 3 + 1 }">
              <div class="suggestion-button" :class="{ accent: i === 1 }"></div>
              <div class="suggestion-cell suggestion-label">
                <NSkeleton text width="100px" height="14px" :sharp="false" />
              </div>
              <div class="suggestion-cell suggestion-a">
                <Row gap="8px">
                  <NSkeleton width="34px" height="34px" :sharp="false" />
                  <Col align="flex-start" gap="4px">
                    <NSkeleton text width="80px" height="16px" :sharp="false" />
                    <NSkeleton text width="96px" height="14px" :sharp="false" />
                  </Col>
                </Row>
              </div>
              <div class="suggestion-cell suggestion-arrow">
                <NIcon :size="24" :component="ArrowRight24Regular" />
              </div>
              <div class="suggestion-cell suggestion-b">
                <Row gap="8px">
                  <NSkeleton width="34px" height="34px" :sharp="false" />
                  <Col align="flex-start" gap="4px">
                    <NSkeleton text width="80px" height="16px" :sharp="false" />
                    <NSkeleton text width="96px" height="14px" :sharp="false" />
                  </Col>
                </Row>
              </div>
            </div>
            <div v-if="i < 3" class="grid-gap" :style="{ '--row': (i - 1) * 3 + 1 }"></div>
          </template>
        </template>
        <template v-else v-for="diff, i in diffSuggestions">
          <RouterLink class="suggestion-link hover-parent" :style="{ '--row': i * 3 + 1 }" :to="{
            name: 'delta',
            params: {
              provider: edition.id,
              a: diff[1][0].id,
              b: diff[1][1].id,
            }
          }">
            <div
              class="suggestion-button"
              :class="{ accent: i === 0 }"
              :aria-label="`Compare ${diff[1][0].id} to ${diff[1][1].id}`"
            ></div>
            <div class="suggestion-cell suggestion-label">{{ diff[0] }}</div>
            <div class="suggestion-cell suggestion-a">
              <VersionDisplay :version="diff[1][0]"/>
            </div>
            <div class="suggestion-cell suggestion-arrow">
              <NIcon :size="24" :component="ArrowRight24Regular" />
            </div>
            <div class="suggestion-cell suggestion-b">
              <VersionDisplay :version="diff[1][1]"/>
            </div>
          </RouterLink>
          <div v-if="i < diffSuggestions.length - 1" class="grid-gap" :style="{ '--row': i * 3 + 1 }"></div>
        </template>
        </div>
        <SelectedVersions
          v-else
          :versions="Array.from(selectedVersions)"
          @deselect="version => selectedVersions.delete(version)"
          @swap="selectedVersions = new Set(Array.from(selectedVersions).reverse())"
        />
        </Transition>
      <template #footer>
        <Transition name="rise">
        <Row v-if="selectedVersions.size === 0">
          <NIcon :size="24" :component="ArrowLeft24Regular" />
          <div>Or select any two versions from the list to compare</div>
        </Row>
        <Row v-else>
          <template v-if="selectedVersions.size === 1">
            <NIcon :size="24" :component="ArrowLeft24Regular" />
            <div>Select one more version from the list</div>
          </template>
          <Spacer />
          <NButton @click="selectedVersions.clear()">Clear selection</NButton>
          <RouterLink v-if="selectedVersions.size === 2" :to="{
            name: 'delta',
            params: {
              provider: edition.id,
              a: ab.a,
              b: ab.b,
            }
          }">
            <NButton class="accent">Compare</NButton>
          </RouterLink>
          <NButton v-else disabled>Compare</NButton>
        </Row>
        </Transition>
      </template>
      </NCard>
    </Col>
  </Row>
</template>

<style lang="scss">
@use '@/util/gradients.scss' as gradients;

.versions-list-wrapper {
  display: flex;
  justify-content: center;
  align-items: stretch;
  width: 280px;
  min-width: 280px;
  box-sizing: border-box;
  height: 100%;
}

.main-panel {
  flex: 1;
  min-width: 0;
}

.suggestions-card {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.suggestions-card > .n-card-content {
  display: grid;
  grid-template-rows: 1fr;
  flex: 1;
  padding-top: 20px !important;
}

.suggestions-card > .n-card-content > * {
  grid-area: 1 / 1;
  align-self: center;
}

.suggestions-card > .n-card__footer {
  display: grid;
}

.suggestions-card > .n-card__footer > * {
  grid-area: 1 / 1;
  min-height: 34px;
}

.rise-enter-active,
.rise-leave-active {
  transition: opacity 300ms cubic-bezier(0.16, 1, 0.3, 1),
              transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
}

.rise-enter-from {
  opacity: 0;
  transform: translateY(24px);
}

.rise-leave-to {
  opacity: 0;
  transform: translateY(-24px);
}

.edition-description {
  flex: 0;

  p {
    margin: 0;
    color: var(--color-5);
    font-size: 14px;
    line-height: 1.5;
  }

  a {
    color: var(--color-6);
    text-decoration: underline;
  }
}

.suggestions-grid {
  display: grid;
  grid-template-columns: auto auto auto;
  justify-content: center;
  align-content: center;
  column-gap: 8px;
  row-gap: 0;
  height: 100%;
}

.grid-gap {
  height: 12px;
  grid-column: 1 / -1;
  grid-row: calc(var(--row) + 2);
}

.suggestion-link,
.suggestion-placeholder {
  display: contents;
}

.suggestion-button {
  grid-column: 1 / -1;
  grid-row: var(--row) / calc(var(--row) + 2);
  width: 100%;
  height: 100%;
  border-radius: 6px;
  border: 1px solid var(--color-2);

  @include gradients.interactive-surface;
  background-color: color-mix(in srgb, var(--color-0), var(--color-1));
  transition:
    --intr-gradient-start_internal 100ms,
    --intr-gradient-end_internal 100ms,
    --intr-gradient-size 100ms,
    --intr-gradient-x 100ms,
    --intr-gradient-y 100ms,
    box-shadow 200ms,
    color 200ms;

  &.accent {
    border-color: color-mix(in srgb, var(--color-accent), var(--color-2));
  }
}

.suggestion-a {
  grid-column: 1;
  grid-row: calc(var(--row) + 1);
  padding-left: 15px;
}

.suggestion-arrow {
  grid-column: 2;
  grid-row: calc(var(--row) + 1);
  padding-inline: 12px;
}

.suggestion-b {
  grid-column: 3;
  grid-row: calc(var(--row) + 1);
  padding-right: 15px;
}

.suggestion-cell {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  min-height: 60px;
  user-select: none;
  font-size: 14px;
  line-height: 14px;
  color: var(--color-5);
  text-shadow: 0 1px 2px #000;
  transition: color 200ms;

  svg {
    filter: drop-shadow(0 1px 2px #000);
  }

  .faded {
    color: var(--color-4);
    transition: color 200ms;
  }
}

.suggestion-label {
  display: flex;
  align-items: center;
  grid-column: 1 / -1;
  grid-row: var(--row);
  padding: 8px 12px 0;
  margin-bottom: -4px;
  color: var(--color-5);
  min-height: auto;
  font-size: 16px;
}

.suggestion-link:hover {
  .suggestion-cell {
    color: var(--color-6);

    .faded {
      color: var(--color-5);
    }
  }

  .suggestion-button {
    --intr-color: rgb(from var(--color-accent) r g b / calc(alpha * 0.5));
  }
}

</style>
