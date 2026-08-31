<script setup lang="ts">
import MCJEVersionsList from '@/delta_providers/mcje/MCJEVersionsList.vue'
import Row from '@/components/Row.vue'
import Spacer from '@/components/Spacer.vue'
import MCJEVersionDisplay from '@/delta_providers/mcje/MCJEVersionDisplay.vue'
import { getDiffSuggestions, loadMCJEManifest, type MCJEManifestVersion } from '@/delta_providers/mcje/version_manifest'
import { ArrowLeft24Regular, ArrowRight24Regular } from '@vicons/fluent'
import { NAlert, NButton, NCard, NIcon, NSkeleton } from 'naive-ui'
import { computed, ref } from 'vue'
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import Col from '@/components/Col.vue'
import MCJEVersionSummary from './MCJEVersionSummary.vue'

const diffSuggestions = ref<[string, MCJEManifestVersion[]][]>([])
const selectedVersions = ref<Set<MCJEManifestVersion>>(new Set())
const ab = computed(() => {
  const [ a, b ] = Array.from(selectedVersions.value)
  return {
    a: a?.id,
    b: b?.id,
  }
})
const errorMessage = ref<string | null>(null)
const loading = ref(true)

function deselect(id: string) {
  const version = Array.from(selectedVersions.value).find(v => v.id === id)
  if (!version) return;
  selectedVersions.value.delete(version)
}

onMounted(async () => {
  try {
    await loadMCJEManifest()
    const suggestions = getDiffSuggestions()
    diffSuggestions.value.push(['Latest version', suggestions.latestVersion])
    if (suggestions.sinceRelease !== null) {
      diffSuggestions.value.push(['Since release', suggestions.sinceRelease])
    }
    // if (suggestions.latestRelease !== null) {
    //   diffSuggestions.value.push(['Latest release', suggestions.latestRelease])
    // }
    if (suggestions.majorRelease !== null) {
      diffSuggestions.value.push(['Major release', suggestions.majorRelease])
    }
    if (suggestions.releasePatches !== null) {
      diffSuggestions.value.push(['Release patches', suggestions.releasePatches])
    }
  } catch (err: any) {
    errorMessage.value = err?.message ?? err?.toString?.() ?? 'n/a'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <NAlert v-if="errorMessage !== null" title="Error" type="error" style="width: 600px;">
    <p>An error occurred while loading the version manifest.</p>
    <p>{{ errorMessage }}</p>
  </NAlert>
  <Row v-else align="stretch" style="height: 100%;">
    <div class="versions-list-wrapper">
      <MCJEVersionsList v-model="selectedVersions" />
    </div>
    <NCard v-if="selectedVersions.size === 0" class="main-panel" title="Comparison Suggestions">
      <div class="suggestions-grid">
        <template v-if="loading">
          <template v-for="i in 3" :key="`placeholder-${i}`">
            <div class="suggestion-label" :style="{ '--row': i * 3 + 1 }">
              <NSkeleton text width="100px" />
            </div>
            <NSkeleton class="suggestion-button suggestion-placeholder" :style="{ '--row': i * 3 + 1 }" />
          </template>
        </template>
        <template v-else v-for="diff, i in diffSuggestions">
          <RouterLink class="suggestion-link hover-parent" :style="{ '--row': i * 3 + 1 }" :to="{
            name: 'delta',
            params: {
              provider: 'mcje',
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
              <MCJEVersionDisplay :version="diff[1][0]"/>
            </div>
            <div class="suggestion-cell suggestion-arrow">
              <NIcon :size="24" :component="ArrowRight24Regular" />
            </div>
            <div class="suggestion-cell suggestion-b">
              <MCJEVersionDisplay :version="diff[1][1]"/>
            </div>
          </RouterLink>
          <div v-if="i < diffSuggestions.length - 1" class="grid-gap" :style="{ '--row': i * 3 + 1 }"></div>
        </template>
      </div>
      <template #footer>
        <Row>
          <NIcon :size="24" :component="ArrowLeft24Regular" />
          <div>Or select any two versions from the list to compare</div>
        </Row>
      </template>
    </NCard>
    <NCard v-else class="main-panel" title="Selected Versions">
      <Col v-if="selectedVersions.size === 1" justify="center" gap="40px" style="height: 100%;">
         <MCJEVersionSummary :id="ab.a">
            <NButton @click="() => deselect(ab.a)">Deselect</NButton>
         </MCJEVersionSummary>
        <Row>
          <NIcon :size="24" :component="ArrowLeft24Regular" />
          <div>Select one more version from the list</div>
        </Row>
      </Col>
      <Row v-else justify="center" align="center" gap="20px" style="height: 100%;">
        <Col gap="20px" style="flex: 1;">
          <Row style="align-self: stretch;">
            <Spacer />
            <MCJEVersionSummary :id="ab.a">
              <NButton @click="() => deselect(ab.a)">Deselect</NButton>
            </MCJEVersionSummary>
            <Spacer flex="1" max="100px" />
            <NIcon :size="24" :component="ArrowRight24Regular" />
            <Spacer flex="1" max="100px" />
            <MCJEVersionSummary :id="ab.b">
              <NButton @click="() => deselect(ab.a)">Deselect</NButton>
            </MCJEVersionSummary>
            <Spacer />
          </Row>
        </Col>
      </Row>
      <template #footer>
        <Row v-if="selectedVersions.size === 1">
          <Spacer />
          <NButton @click="selectedVersions.clear()">Clear selection</NButton>
          <NButton disabled>Compare</NButton>
        </Row>
        <Row v-else>
          <Spacer />
          <NButton @click="selectedVersions.clear()">Clear selection</NButton>
          <RouterLink :to="{
            name: 'delta',
            params: {
              provider: 'mcje',
              a: ab.a,
              b: ab.b,
            }
          }">
            <NButton class="accent">Compare</NButton>
          </RouterLink>
        </Row>
      </template>
    </NCard>
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

.suggestion-link {
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

.suggestion-placeholder {
  width: 420px;
  max-width: 100%;
  height: 60px;
  border-radius: 6px;
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
