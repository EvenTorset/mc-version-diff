<script setup lang="ts">
import MCJEVersionsList from '@/delta_providers/mcje/MCJEVersionsList.vue'
import Row from '@/components/Row.vue'
import Spacer from '@/components/Spacer.vue'
import MCJEVersionDisplay from '@/delta_providers/mcje/MCJEVersionDisplay.vue'
import { getDiffSuggestions, loadMCJEManifest, type MCJEManifestVersion } from '@/delta_providers/mcje/version_manifest'
import { ArrowLeft24Regular, ArrowRight24Regular } from '@vicons/fluent'
import { NAlert, NButton, NCard, NIcon } from 'naive-ui'
import { computed, ref } from 'vue'
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import Col from '@/components/Col.vue'
import Content from '@/components/Content.vue'
import { asyncRenderable } from '@/util/asyncRenderable'
import { header, singleHeader } from './header'

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
        <template v-for="diff, i in diffSuggestions">
          <div class="suggestion-label" :style="{ '--row': i + 1, '--row-narrow': i * 2 + 1 }">{{ diff[0] }}:</div>
          <RouterLink class="suggestion-link hover-parent" :style="{ '--row': i + 1, '--row-narrow': i * 2 + 1 }" :to="{
            name: 'delta',
            params: {
              provider: 'mcje',
              a: diff[1][0].id,
              b: diff[1][1].id,
            }
          }">
            <NButton
              class="suggestion-button"
              :class="{ accent: i === 0 }"
              :aria-label="`Compare ${diff[1][0].id} to ${diff[1][1].id}`"
            />
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
         <Content :content="asyncRenderable(singleHeader(ab.a, deselect))"/>
        <Row>
          <NIcon :size="24" :component="ArrowLeft24Regular" />
          <div>Select one more version from the list</div>
        </Row>
      </Col>
      <Row v-else justify="center" align="center" gap="20px" style="height: 100%;">
        <Content :content="asyncRenderable(header(ab.a, ab.b, false, deselect))"/>
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

<style>

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
  grid-template-columns: auto auto auto auto;
  justify-content: start;
  column-gap: 8px;
  row-gap: 4px;
  align-items: stretch;

  @media screen and (max-width: 1200px) {
    grid-template-columns: auto auto auto;
    row-gap: 8px;
  }
}

.suggestion-label {
  display: flex;
  align-items: center;
  grid-column: 1;
  grid-row: var(--row);

  @media screen and (max-width: 1200px) {
    grid-column: 1 / -1;
    grid-row: var(--row-narrow);
  }
}

.suggestion-link {
  display: contents;
}

.suggestion-button {
  grid-column: 2 / 5;
  grid-row: var(--row);
  width: 100%;
  height: 100%;

  @media screen and (max-width: 1200px) {
    grid-column: 1 / -1;
    grid-row: calc(var(--row-narrow) + 1);
  }
}

.suggestion-a {
  grid-column: 2;
  grid-row: var(--row);
  padding-left: 15px;

  @media screen and (max-width: 1200px) {
    grid-column: 1;
    grid-row: calc(var(--row-narrow) + 1);
  }
}

.suggestion-arrow {
  grid-column: 3;
  padding-inline: 12px;
  grid-row: var(--row);

  @media screen and (max-width: 1200px) {
    grid-column: 2;
    grid-row: calc(var(--row-narrow) + 1);
  }
}

.suggestion-b {
  grid-column: 4;
  grid-row: var(--row);
  padding-right: 15px;

  @media screen and (max-width: 1200px) {
    grid-column: 3;
    grid-row: calc(var(--row-narrow) + 1);
  }
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
  color: var(--color-6);
  text-shadow: 0 1px 2px #000;
  transition: color 200ms;

  svg {
    filter: drop-shadow(0 1px 2px #000);
  }

  .faded {
    color: var(--color-5);
    transition: color 200ms;
  }
}

.suggestion-link:hover .suggestion-cell {
  color: var(--color-7);

  .faded {
    color: var(--color-6);
  }
}

</style>
