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
  <Row v-else align="stretch">
    <div class="versions-list-wrapper">
      <MCJEVersionsList v-model="selectedVersions" />
    </div>
    <NCard v-if="selectedVersions.size === 0" class="main-panel" title="Comparison Suggestions">
      <div class="suggestions-grid">
        <template v-for="diff, i in diffSuggestions">
          <div>{{ diff[0] }}:</div>
          <div>
            <RouterLink :to="{
              name: 'delta',
              params: {
                provider: 'mcje',
                a: diff[1][0].id,
                b: diff[1][1].id,
              }
            }">
              <NButton :class="{ accent: i === 0 }" :style="{
                height: '60px',
              }">
                <Row gap="20px">
                  <MCJEVersionDisplay :version="diff[1][0]"/>
                  <NIcon :size="24" :component="ArrowRight24Regular" />
                  <MCJEVersionDisplay :version="diff[1][1]"/>
                </Row>
              </NButton>
            </RouterLink>
          </div>
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
  align-items: center;
  width: 280px;
  min-width: 280px;
  box-sizing: border-box;
}

.main-panel {
  width: 800px;
}

.suggestions-grid {
  display: grid;
  grid-template-columns: auto 2fr;
  column-gap: 8px;
  row-gap: 4px;
  align-items: center;

  @media screen and (max-width: 1200px) {
    grid-template-columns: auto;
  }
}

</style>
