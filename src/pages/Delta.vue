<script setup lang="ts">
import AnimatedHeight from '@/components/AnimatedHeight.vue'
import Content from '@/components/Content.vue'
import VersionDiffLogo from '@/components/VersionDiffLogo.vue'
import type { DeltaProvider, DeltaProviderCategory, DeltaResult, DeltaTrack } from '@/delta_providers'
import { getDeltaProvider } from '@/delta_providers/registry'
import { getTrackCategory } from '@/delta_providers/category'
import { NButton, NCard, NCheckbox, NInput, NRadio, NRadioGroup, NSelect, NSpin, type InputInst } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Row from '@/components/Row.vue'
import TreeList from '@/components/TreeList.vue'
import { createProgressList } from '@/components/progressList'
import { Eraser20Filled, TextPeriodAsterisk20Filled } from '@vicons/fluent'
import '@/viewers'
import { prefetchTextViews } from '@/components/lazyText'
import { prefetchRenderers } from '@/components/lazyRenderers'
import Col from '@/components/Col.vue'
import Tooltip from '@/components/Tooltip.vue'
import { animateTextures, imageViewMode } from '@/viewers/png'
import { hasAnimations, mcmetaTexture } from '@/viewers/mcje/mcmeta'
import { DeltaTrackState, type DeltaTrackStateName } from '@/delta_providers/states'
import { asyncRenderable } from '@/util/asyncRenderable'
import CategoryTab from '@/components/CategoryTab.vue'
import TransitionList from '@/components/TransitionList.vue'
import Notify from '@/notify'
import { resolveStaticOrAsync } from '@/util/resolveToStatic'
import { focusedTab, focusedTrack, initTrackFocus } from '@/util/trackFocus'
import type { ImageViewMode } from '@/types'
import StateFilterToggle from '@/components/StateFilterToggle.vue'
import { Settings } from '@/settings'
import { errorMessage } from '@/util/errorMessage'
import { naturalCompare } from '@/util/sort'

const route = useRoute()
const router = useRouter()

function param<T extends string>(key: string): T | undefined {
  const value = route.query[key]
  return typeof value === 'string' ? value as T : undefined
}

initTrackFocus(param('file'), param('tab'))

const imageModes: ImageViewMode[] = [ 'rgba', 'rgb', 'r', 'g', 'b', 'a' ]
imageViewMode.value = imageModes.find(mode => mode === param('mode')) ?? 'rgba'
animateTextures.value = param('animate') === '1'
mcmetaTexture.value = param('animtexture') === '1'

const progressDisplay = createProgressList()

const provider = shallowRef<DeltaProvider<unknown> | null>(null)
const dr = shallowRef<DeltaResult>()
const provCategories = ref<DeltaProviderCategory[]>([])

watch(provider, async p => {
  provCategories.value = await resolveStaticOrAsync(p?.categories ?? [])
})

const symUncategorized = Symbol('Uncategorized')

const tracksFilteredByStateAndPath = computed<DeltaTrack[]>(() => {
  const dr_ = dr.value
  if (!dr_) return []

  const query = debouncedPathFilter.value.trim()

  let regex: RegExp | null = null
  if (findRegex.value && query) {
    try {
      regex = new RegExp(query, 'i')
    } catch {
      // invalid regex
    }
  }

  return dr_.tracks.filter(track => {
    if (stateFilter.value !== null && DeltaTrackState[track.state] !== stateFilter.value) return false

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
  const dr_ = dr.value
  const prov = provider.value
  if (!dr_ || !prov) return new Map()
  return Map.groupBy(
    tracksFilteredByStateAndPath.value,
    track => getTrackCategory(prov, dr_, track) ?? symUncategorized
  )
})
const categories = computed(() => {
  const arr = Array.from(categoriesUnordered.value.entries()).sort((a, b) => {
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
  arr.unshift(['Overview', []])
  return arr
})

const states = computed<[DeltaTrackStateName, DeltaTrack[]][]>(() => {
  const dr_ = dr.value
  if (!dr_) return []

  const statesObj: Partial<Record<DeltaTrackState, DeltaTrack[]>> =
    Object.groupBy(dr_.tracks, track => track.state)

  const out: [DeltaTrackStateName, DeltaTrack[]][] = []
  if (statesObj[DeltaTrackState.Added]?.length)
    out.push(['Added', statesObj[DeltaTrackState.Added]])
  if (statesObj[DeltaTrackState.Edited]?.length)
    out.push(['Edited', statesObj[DeltaTrackState.Edited]])
  if (statesObj[DeltaTrackState.Moved]?.length)
    out.push(['Moved', statesObj[DeltaTrackState.Moved]])
  if (statesObj[DeltaTrackState.Removed]?.length)
    out.push(['Removed', statesObj[DeltaTrackState.Removed]])

  return out
})

const defaultCategory = computed(() => {
  const favorite = Settings.favoriteCategory[route.params.provider as string]
  return favorite && categories.value.some(e => e[0] === favorite) ? favorite ?? 'Overview' : 'Overview'
})

const selectedCategory = ref<string>(param('category') ?? '')
watch(categories, newCategories => {
  if (!dr.value) return;

  const match = newCategories.find(([k, v]) =>
    v.length > 0 && k.toLowerCase() === selectedCategory.value.toLowerCase())
  selectedCategory.value = match ? match[0] : defaultCategory.value
})

watch(() => param('category'), value => {
  if (!value) {
    if (selectedCategory.value !== 'Overview') selectedCategory.value = 'Overview'
    return
  }
  const match = categories.value.find(([ name, tracks ]) =>
    tracks.length > 0 && name.toLowerCase() === value.toLowerCase())
  if (match && match[0] !== selectedCategory.value) selectedCategory.value = match[0]
})

const isImageCategory = computed(() =>
  !!provCategories.value.find(c => c.name === selectedCategory.value)?.isImages)

const animationCategories = ref(new Set<string>())
let animationScan = 0
watch(categories, async list => {
  const scan = ++animationScan
  const dr_ = dr.value
  const names = dr_
    ? await Promise.all(list.map(async ([ name, tracks ]) => await hasAnimations(dr_, tracks) ? name : null))
    : []
  if (scan === animationScan) animationCategories.value = new Set(names.filter(n => n !== null))
}, { immediate: true })

const categoryHasAnimations = computed(() => animationCategories.value.has(selectedCategory.value))

const imageDisplayOptions = computed(() => [
  ...isImageCategory.value ? [
    { id: 'modes', heading: 'Channels' },
    { id: 'animate', heading: 'Animation' },
  ] : [],
  ...categoryHasAnimations.value ? [ { id: 'preview', heading: 'Animation' } ] : [],
])

const stateFilter = ref<DeltaTrackStateName | null>(
  param('state') as DeltaTrackStateName ?? null
)

watch(() => param('state'), value => {
  const next = (value as DeltaTrackStateName) ?? null
  if (stateFilter.value !== next) stateFilter.value = next
})

const findInput = ref<InputInst | null>(null)
const findRegex = ref(param('regex') === '1')
const pathFilter = ref<string>(param('search') ?? '')
const debouncedPathFilter = ref<string>(pathFilter.value)
let debounceTimer: ReturnType<typeof setTimeout> | undefined

const sortBy = ref<'state_file_path' | 'file_path' | 'size' | 'abs_size'>(param('sortBy') ?? 'state_file_path')
const sortDir = ref<'asc' | 'desc'>(param('sortDir') ?? 'asc')

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

const baseSortFunc = computed<(a: DeltaTrack, b: DeltaTrack) => number>(() => {
  switch (sortBy.value) {
    case 'state_file_path': return (a, b) => a.state - b.state || naturalCompare(a.id, b.id)
    case 'file_path': return (a, b) => naturalCompare(a.id, b.id)
    case 'size': return (a, b) => a.sizeDiff - b.sizeDiff
    case 'abs_size': return (a, b) => a.absSizeDiff - b.absSizeDiff
  }
})

const sortFunc = computed(() => {
  if (sortDir.value === 'asc') {
    return baseSortFunc.value
  } else {
    return (a, b) => baseSortFunc.value(b, a)
  }
})

const drFilteredSorted = computed<DeltaResult | undefined>(() => {
  const dr_ = dr.value
  if (!dr_) return undefined

  const activeCategory = categories.value.find(([name]) => name === selectedCategory.value)

  return {
    ...dr_,
    tracks: activeCategory ? activeCategory[1].toSorted(sortFunc.value) : [],
  }
})

const urlState = computed(() => {
  const query: Record<string, string> = {}

  if (selectedCategory.value) {
    query.category = selectedCategory.value.toLowerCase()
  }
  if (debouncedPathFilter.value) query.search = debouncedPathFilter.value
  if (findRegex.value) query.regex = '1'

  if (stateFilter.value !== null) {
    query.state = stateFilter.value
  }

  const shown = new Set(imageDisplayOptions.value.map(option => option.id))
  if (shown.has('modes') && imageViewMode.value !== 'rgba') query.mode = imageViewMode.value
  if (shown.has('animate') && animateTextures.value) query.animate = '1'
  if (shown.has('preview') && mcmetaTexture.value) query.animtexture = '1'

  if (focusedTrack.value) query.file = focusedTrack.value
  if (focusedTab.value) query.tab = focusedTab.value

  if (sortBy.value !== 'state_file_path') query.sortBy = sortBy.value
  if (sortDir.value !== 'asc') query.sortDir = sortDir.value

  return query
})

watch(urlState, query => router.replace({ query }))

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
    dr.value = await provider.value.compare(a, b, contentA, contentB, progressDisplay)
    prefetchTextViews()
    prefetchRenderers()
  } catch (err: any) {
    Notify.error({
      content: errorMessage(err)
    })
    router.replace({ name: 'home' })
  }
})

const countColWidth = ref<string>('auto')

function updateCountWidth() {
  requestAnimationFrame(() => {
    const countEls = document.querySelectorAll<HTMLElement>(
      '.category-list .transition-list-item:not(.transition-list-leave-active) .category-tab-count'
    )
    if (!countEls.length) return

    let max = 0
    for (const el of countEls) {
      const width = el.scrollWidth
      if (width > max) max = width
    }

    if (max > 0) {
      countColWidth.value = `${Math.ceil(max)}px`
    }
  })
}

watch(categories, () => {
  nextTick(updateCountWidth)
}, { immediate: true })

onMounted(() => {
  nextTick(updateCountWidth)
})
</script>

<template>
  <div class="transition-container">
    <Transition name="cross-slide">
      <div v-if="dr" :style="{
        display: 'flex',
        alignItems: 'stretch',
        flex: 1,
        alignSelf: 'stretch',
        marginRight: 'var(--content-gutter)',
        marginLeft: dr.tracks.length === 0 ? 'var(--content-gutter)' : '0',
      }">
        <Col class="sidebar">
          <Row justify="center">
            <RouterLink :to="{ name: 'home' }">
              <VersionDiffLogo :style="{
                fontSize: '12px',
                marginBottom: '12px',
              }" :weight="1.4" />
            </RouterLink>
          </Row>
          <NCard v-if="dr.tracks.length > 0" title="Filter & Sort" :style="{
            width: 'calc(100% - 24px)',
          }">
            <Col gap="8px" align="stretch">
              <NInput
                clearable
                placeholder="File path..."
                ref="findInput"
                @vue:mounted="onFindInputMounted"
                v-model:value="pathFilter"
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
                <template v-for="[name, tracks] in states">
                  <StateFilterToggle
                    :name
                    :count="tracks.length"
                    v-model="stateFilter"
                  />
                </template>
              </Row>
              <div class="panel-heading">Sort</div>
              <Row>
                <NSelect
                  style="flex: 2; overflow: hidden; user-select: none;"
                  :consistent-menu-width="false"
                  v-model:value="sortBy"
                  :options="[
                    {
                      label: 'State > file path',
                      value: 'state_file_path',
                    },
                    {
                      label: 'File path',
                      value: 'file_path',
                    },
                    {
                      label: 'Size difference',
                      value: 'size',
                    },
                    {
                      label: 'Absolute size difference',
                      value: 'abs_size',
                    },
                  ]"
                />
                <NSelect
                  style="flex: 1; overflow: hidden; user-select: none;"
                  :consistent-menu-width="false"
                  v-model:value="sortDir"
                  :options="[
                    {
                      label: 'Ascending',
                      value: 'asc',
                    },
                    {
                      label: 'Descending',
                      value: 'desc',
                    },
                  ]"
                />
              </Row>
            </Col>
          </NCard>
          <NCard title="Categories" :style="{
            width: 'calc(100% - 24px)',
          }">
            <Col align="stretch" gap="0">
              <AnimatedHeight style="overflow: visible;">
                <TransitionList
                  :items="categories"
                  :key-field="0"
                  class="category-list"
                  :style="{ '--count-col-width': countColWidth }"
                >
                  <template #default="{ item: [ name, tracks ] }">
                    <CategoryTab
                      v-if="tracks.length > 0 || name === 'Overview'"
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
              v-if="imageDisplayOptions.length > 0"
              class="image-display"
              title="Image Display"
              :style="{
                width: 'calc(100% - 24px)',
              }"
            >
              <AnimatedHeight :duration="350">
                <TransitionList :items="imageDisplayOptions" :style="{
                  display: 'flex',
                  flexFlow: 'column',
                  gap: '12px',
                }">
                  <template #default="{ item }">
                    <div v-if="imageDisplayOptions.length > 1" class="panel-heading">{{ item.heading }}</div>
                    <NRadioGroup v-if="item.id === 'modes'" v-model:value="imageViewMode">
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
                    <NCheckbox
                      v-else-if="item.id === 'animate'"
                      v-model:checked="animateTextures"
                      label="Animate textures"
                    />
                    <NCheckbox v-else v-model:checked="mcmetaTexture" label="Show animation texture" />
                  </template>
                </TransitionList>
              </AnimatedHeight>
            </NCard>
          </Transition>
        </Col>
        <Col align="stretch" class="main-content-container">
          <div class="category-transition-container">
            <Transition name="category-fade">
              <Col
                v-if="selectedCategory === 'Overview'"
                key="Overview"
                align="stretch"
                style="padding-top: 48px;"
              >
                <Row align="flex-start">
                  <Suspense>
                    <Content :content="asyncRenderable(provider?.overview(dr))"/>
                    <template #fallback>
                      <NSpin size="large" />
                    </template>
                  </Suspense>
                </Row>
              </Col>
              <div
                v-else
                :key="selectedCategory"
                style="container-type: inline-size;"
              >
                <TreeList :dr="drFilteredSorted ?? dr" />
              </div>
            </Transition>
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

<style lang="scss" scoped>

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

.category-transition-container {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
  width: 100%;
}

.category-transition-container > * {
  grid-area: 1 / 1;
}

.category-fade-enter-active,
.category-fade-leave-active {
  transition:
    opacity 200ms ease-in,
    transform 200ms ease-in;
}

.category-fade-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.category-fade-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

.sidebar {
  position: sticky;
  top: 0;
  width: var(--sidebar-width);
  max-height: 100vh;
  overflow-y: auto;
  padding: 20px 0 40px;
  box-sizing: border-box;
}

.category-list {
  display: grid;
  grid-template-columns: var(--count-col-width, auto) 1fr auto;
  column-gap: 6px;
  transition: grid-template-columns 250ms;
}

.category-list :deep(.transition-list-item) {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
}

.main-content-container {
  flex: 1;
  min-width: 0;
  padding: 12px 0 60px;
  width: fit-content;
}

</style>
