<script setup lang="ts">
import AnimatedHeight from '@/components/AnimatedHeight.vue'
import Content from '@/components/Content.vue'
import VersionDiffLogo from '@/components/VersionDiffLogo.vue'
import type { DeltaProvider, DeltaProviderCategory, DeltaResult, DeltaTrack } from '@/delta_providers'
import { getDeltaProvider } from '@/delta_providers/registry'
import { NButton, NCard, NInput, NRadio, NRadioGroup, NSpin, type InputInst } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Row from '@/components/Row.vue'
import BiTreeList from '@/components/BiTreeList.vue'
import { createProgressList } from '@/components/progressList'
import { Eraser20Filled, TextPeriodAsterisk20Filled } from '@vicons/fluent'
import '@/viewers'
import Col from '@/components/Col.vue'
import Tooltip from '@/components/Tooltip.vue'
import { imageViewMode } from '@/viewers/png'
import { DeltaTrackState } from '@/delta_providers/states'
import { asyncRenderable } from '@/util/asyncRenderable'
import CategoryTab from '@/components/CategoryTab.vue'
import TransitionList from '@/components/TransitionList.vue'
import Notify from '@/notify'
import { resolveStaticOrAsync } from '@/util/resolveStaticOrAsync'

const route = useRoute()
const router = useRouter()

const progressDisplay = createProgressList()

const provider = shallowRef<DeltaProvider<unknown> | null>(null)
const diff = shallowRef<DeltaResult>()
const provCategories = ref<DeltaProviderCategory[]>([])

watch(provider, async p => {
  provCategories.value = await resolveStaticOrAsync(p?.categories ?? [])
})

const symUncategorized = Symbol('Uncategorized')

const tracksFilteredByStateAndPath = computed<DeltaTrack[]>(() => {
  const dr = diff.value
  if (!dr) return []

  const query = debouncedPathFilter.value.trim()

  let regex: RegExp | null = null
  if (findRegex.value && query) {
    try {
      regex = new RegExp(query, 'i')
    } catch {
      // invalid regex
    }
  }

  return dr.tracks.filter(track => {
    if (stateFilters.value[track.state] === false) return false

    if (query) {
      const paths = [track.a, track.b].filter(p => p !== '')

      if (findRegex.value) {
        if (!regex) return false
        if (!paths.some(p => regex.test(p))) return false
      } else {
        const lowerQuery = query.toLowerCase()
        if (!paths.some(p => p.toLowerCase().includes(lowerQuery))) return false
      }
    }

    return true
  })
})

const categoriesUnordered = computed<Map<DeltaProviderCategory | typeof symUncategorized, DeltaTrack[]>>(() => {
  const dr = diff.value
  const prov = provider.value
  if (!dr || !prov) return new Map()
  return Map.groupBy(
    tracksFilteredByStateAndPath.value,
    track => provCategories.value.find(c => c.test(dr, track)) ?? symUncategorized
  )
})
const categories = computed(() => (
  Array.from(categoriesUnordered.value.entries()).sort((a, b) => {
    if (a[0] === symUncategorized) {
      if (b[0] === symUncategorized) {
        return 0
      }
      return 1
    }
    if (b[0] === symUncategorized) {
      return -1
    }
    return a[0].sort - b[0].sort
  }).map(e => [e[0] === symUncategorized ? 'Other' : e[0].name, e[1]] as const)
))

const states = computed<[string, DeltaTrackState, DeltaTrack[]][]>(() => {
  const dr = diff.value
  if (!dr) return []

  const statesObj: Partial<Record<DeltaTrackState, DeltaTrack[]>> =
    Object.groupBy(dr.tracks, track => track.state)

  const out: [string, DeltaTrackState, DeltaTrack[]][] = []
  if (statesObj[DeltaTrackState.Added]?.length)
    out.push(['Added', DeltaTrackState.Added, statesObj[DeltaTrackState.Added]])
  if (statesObj[DeltaTrackState.Edited]?.length)
    out.push(['Edited', DeltaTrackState.Edited, statesObj[DeltaTrackState.Edited]])
  if (statesObj[DeltaTrackState.Moved]?.length)
    out.push(['Moved', DeltaTrackState.Moved, statesObj[DeltaTrackState.Moved]])
  if (statesObj[DeltaTrackState.Removed]?.length)
    out.push(['Removed', DeltaTrackState.Removed, statesObj[DeltaTrackState.Removed]])

  return out
})

const selectedCategory = ref<string>('')
watch(categories, newCategories => {
  if (newCategories.some(([k, v]) => k === selectedCategory.value && v.length > 0)) {
    return;
  }
  let first = true
  for (const [ name, tracks ] of newCategories) {
    if (tracks.length > 0 && first) {
      selectedCategory.value = name
      first = false
    }
  }
})

const stateFilters = ref<Partial<Record<DeltaTrackState, boolean>>>({})
watch(states, newStates => {
  stateFilters.value = {}
  for (const [ , state, tracks ] of newStates) {
    if (tracks.length > 0) {
      stateFilters.value[state] = true
    }
  }
})

const findInput = ref<InputInst | null>(null)
const findRegex = ref(false)
const pathFilter = ref<string>('')
const debouncedPathFilter = ref<string>('')
let debounceTimer: ReturnType<typeof setTimeout> | undefined

watch(pathFilter, (newVal) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedPathFilter.value = newVal
  }, 250)
})

function onKeydown(event: KeyboardEvent) {
  if (
    (event.ctrlKey || event.metaKey)
    && event.key.toLowerCase() === 'f'
    && findInput.value?.inputElRef !== document.activeElement
  ) {
    event.preventDefault()
    findInput.value?.select()
  }
}

function onFindInputMounted() {
  window.addEventListener('keydown', onKeydown)
}

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  window.removeEventListener('keydown', onKeydown)
})

const filteredDiff = computed<DeltaResult | undefined>(() => {
  const dr = diff.value
  if (!dr) return undefined

  const activeCategory = categories.value.find(([name]) => name === selectedCategory.value)

  return {
    ...dr,
    tracks: activeCategory ? [...activeCategory[1]] : [],
  }
})

onMounted(async () => {
  provider.value = getDeltaProvider(route.params.provider as string)
  if (provider.value === null) {
    Notify.error({
      content: `Invalid delta provider: ${route.params.provider}`
    })
    router.replace({ name: 'home' })
    return;
  }
  try {
    const a = route.params.a as string
    const b = route.params.b as string
    const { contentA, contentB } = await provider.value.fetch(a, b, progressDisplay)
    diff.value = await provider.value.compare(a, b, contentA, contentB, progressDisplay)
  } catch (err: any) {
    Notify.error({
      content: err?.message ?? err?.toString() ?? 'Unknown error.'
    })
    router.replace({ name: 'home' })
  }
})
</script>

<template>
  <div class="transition-container">
    <Transition name="cross-slide">
      <div v-if="diff" :style="{
        display: 'flex',
        alignItems: 'stretch',
        flex: 1,
        alignSelf: 'stretch',
        marginRight: '20px',
        marginLeft: diff.tracks.length === 0 ? '20px' : '0',
      }">
        <Col  v-if="diff.tracks.length > 0" class="sidebar">
          <Row justify="center">
            <RouterLink :to="{ name: 'home' }">
              <VersionDiffLogo :style="{
                fontSize: '12px',
                marginBottom: '12px',
              }" :weight="1.4" />
            </RouterLink>
          </Row>
          <NCard title="Filter" :style="{
            width: 'calc(100% - 24px)',
          }">
            <Col gap="8px" align="stretch">
              <NInput clearable placeholder="File path..." ref="findInput" @vue:mounted="onFindInputMounted" v-model:value="pathFilter">
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
                <template #suffix>
                  <Tooltip>
                    <template #trigger="{ props }">
                      <NButton
                        v-bind="props"
                        circle
                        class="icon"
                        :class="{
                          selected: findRegex,
                          accent: findRegex,
                        }"
                        size="small"
                        :bordered="false"
                        @click="findRegex = !findRegex"
                      >
                        <template #icon>
                          <TextPeriodAsterisk20Filled />
                        </template>
                      </NButton>
                    </template>
                    Use Regular Expression
                  </Tooltip>
                </template>
              </NInput>
              <Row align="stretch">
                <template v-for="[name, state, tracks] in states">
                  <NButton
                    v-if="tracks.length > 0"
                    :class="{
                      accent: stateFilters[state],
                      selected: stateFilters[state],
                    }"
                    @click="stateFilters[state] = !stateFilters[state]"
                    style="height: fit-content; flex: 1; padding: 8px 0;"
                  >
                    <Col>
                      <div :style="{
                        color: stateFilters[state] ? 'var(--color-6)' : 'var(--color-5)',
                        fontSize: '1.2em',
                      }">{{ tracks.length }}</div>
                      <div :style="{
                        color: stateFilters[state] ? 'var(--color-6)' : 'var(--color-5)',
                        fontSize: '10px',
                        fontWeight: 600,
                      }">{{ name }}</div>
                    </Col>
                  </NButton>
                </template>
              </Row>
            </Col>
          </NCard>
          <NCard title="Categories" :style="{
            width: 'calc(100% - 24px)',
          }">
            <Col align="stretch" gap="0">
              <AnimatedHeight style="overflow: visible;">
                <TransitionList :items="categories" :key-field="0">
                  <template #default="{ item: [ name, tracks ] }">
                    <CategoryTab
                      v-if="tracks.length > 0"
                      :count="tracks.length"
                      :name
                      :selected="selectedCategory === name"
                      @click="selectedCategory = name"
                    />
                  </template>
                </TransitionList>
              </AnimatedHeight>
            </Col>
          </NCard>
          <Transition name="slide-fade">
            <NCard
              v-if="provCategories.find(c => c.name === selectedCategory)?.isImages"
              title="Image Display"
              :style="{
                width: 'calc(100% - 24px)',
              }"
            >
              <NRadioGroup v-model:value="imageViewMode">
                <div :style="{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                }">
                  <NRadio value="rgba" label="RGBA" />
                  <NRadio value="rgb" label="RGB" />
                  <NRadio value="a" label="Alpha" />

                  <NRadio value="r" label="Red" />
                  <NRadio value="g" label="Green" />
                  <NRadio value="b" label="Blue" />
                </div>
              </NRadioGroup>
            </NCard>
          </Transition>
        </Col>
        <Col align="stretch" class="main-content-container">
          <Col v-if="diff.tracks.length === 0">
            <RouterLink :to="{ name: 'home' }">
              <VersionDiffLogo />
            </RouterLink>
          </Col>
          <Row :style="{
            marginBottom: '60px',
          }">
            <Suspense>
              <Content :content="asyncRenderable(provider?.header(diff.a, diff.b))"/>
              <template #fallback>
                <NSpin size="large" />
              </template>
            </Suspense>
          </Row>
          <Col v-if="diff.tracks.length === 0" style="flex: 1;">
            <h1>No changes</h1>
            <p>{{ diff.a }} and {{ diff.b }} have identical assets and data.</p>
          </Col>
          <div v-else style="container-type: inline-size;">
            <BiTreeList :dr="filteredDiff ?? diff" />
          </div>
        </Col>
      </div>
      <Col v-else justify="safe center" align="safe center" gap="40px" :style="{
        minHeight: '100vh',
        maxHeight: '100vh',
        overflowY: 'auto',
        padding: '8em 20px',
        boxSizing: 'border-box',
      }">
        <VersionDiffLogo :style="{ fontSize: '24px' }"/>
        <NCard title="Generating Delta" :style="{
          maxWidth: 'min(100vw - 80px, 800px)',
          minWidth: '460px',
        }">
          <AnimatedHeight>
            <Content :content="progressDisplay"/>
          </AnimatedHeight>
        </NCard>
      </Col>
    </Transition>
  </div>
</template>

<style lang="css" scoped>

.transition-container {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
  flex: 1;
  width: 100%;
}

.transition-container > * {
  grid-area: 1 / 1;
}

.cross-slide-enter-active,
.cross-slide-leave-active {
  transition: opacity 500ms cubic-bezier(0.16, 1, 0.3, 1),
              transform 500ms cubic-bezier(0.16, 1, 0.3, 1);
}

.cross-slide-enter-from {
  opacity: 0;
  transform: translateY(128px);
}

.cross-slide-leave-to {
  opacity: 0;
  transform: translateY(-128px);
}

.sidebar {
  position: sticky;
  top: 0;
  width: 340px;
  max-height: 100vh;
  overflow-y: auto;
  padding: 20px 0 40px;
  box-sizing: border-box;
}

.main-content-container {
  flex: 1;
  min-width: 0;
  padding: 60px 0;
  width: fit-content;
}

</style>
