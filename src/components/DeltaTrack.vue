<script setup lang="tsx">
import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import FilePath from '@/components/FilePath.vue'
import { ArrowDownload24Regular, ArrowTurnRight20Filled, ChevronDown20Filled, Copy24Regular } from '@vicons/fluent'
import IconButton from './IconButton.vue'
import TrackTag from './TrackTag.vue'
import { onMounted, ref, shallowRef, watch } from 'vue'
import AnimatedHeight from './AnimatedHeight.vue'
import Content from '@/components/Content.vue'
import { getViewer } from '@/viewers/registry.ts'
import Dim from './Dim.vue'
import type { Renderable } from '@/types.ts'
import { DeltaTrackState } from '@/delta_providers/states.ts'
import Col from './Col.vue'
import MarkFilePathChanges from './MarkFilePathChanges.vue'
import { basename } from '@/util/path.ts'
import { saveAs } from 'file-saver'
import Tooltip from './Tooltip.vue'
import { getCopier } from '@/util/clipboard.ts'
import { holdFocus, isInitialFocus } from '@/util/trackFocus.ts'
import { computed } from 'vue'
import Notify from '@/notify.tsx'
import SizeDiff from './SizeDiff.vue'

const props = defineProps<{
  track: DeltaTrack
  dr: DeltaResult
}>()

const category = computed(() => props.dr.getCategory(props.track))
const copyFunc = computed(() => getCopier(props.track))

let restoredFocus = isInitialFocus(props.track.id)

const initExpanded = restoredFocus || (
  (
    props.track.state === DeltaTrackState.Added
    || props.track.state === DeltaTrackState.Edited
  )
  && (category.value?.expand ?? false)
)

const deltaTrack = ref<HTMLDivElement>()
const interacted = ref(false)
const expanded = ref(initExpanded)
const isInitialAutoExpanded = ref(initExpanded)
const isInitialRender = ref(initExpanded)
const shouldRenderContent = ref(initExpanded)

const viewer = computed(() => getViewer(props.dr, props.track))
const view = shallowRef<Renderable>()

function defaultViewer() {
  return <Dim style="padding: 4px;"><i>No viewer is registered for this file type.</i></Dim>
}

let renderPromise: Promise<Renderable> | undefined

function renderView() {
  renderPromise ??= (async () => {
    try {
      return (await viewer.value?.render(props.dr, props.track)) ?? defaultViewer
    } catch (err) {
      renderPromise = undefined
      throw err
    }
  })()
  return renderPromise
}

watch(() => props.track, () => {
  renderPromise = undefined
  view.value = undefined
})

watch(expanded, async (isExpanded) => {
  isInitialAutoExpanded.value = false
  restoredFocus = false

  if (!isExpanded) {
    scrollCollapsedIntoView()
    return;
  }
  holdFocus(props.track.id)
  shouldRenderContent.value = true
  view.value = await renderView()
})

function handleAnimationEnd() {
  if (!expanded.value) {
    shouldRenderContent.value = false
  } else {
    if (!isInitialAutoExpanded.value && !restoredFocus) {
      scrollExpandedIntoView()
    }
    isInitialAutoExpanded.value = false
  }
}

onMounted(async () => {
  if (expanded.value) {
    view.value = await renderView()
  }
  isInitialRender.value = false
})

const SCROLL_MARGIN = 4

function scrollExpandedIntoView() {
  const el = deltaTrack.value
  if (!el) return;

  const rect = el.getBoundingClientRect()
  const viewportHeight = window.innerHeight

  if (rect.height + SCROLL_MARGIN * 2 > viewportHeight) {
    if (rect.top <= SCROLL_MARGIN) return;

    window.scrollTo({
      top: window.scrollY + rect.top - SCROLL_MARGIN,
      behavior: 'smooth',
    })
    return;
  }

  if (rect.bottom > viewportHeight - SCROLL_MARGIN) {
    window.scrollTo({
      top: window.scrollY + rect.top - (viewportHeight - rect.height) / 2,
      behavior: 'smooth',
    })
  }
}

function scrollCollapsedIntoView() {
  const el = deltaTrack.value
  if (!el) return;

  const rect = el.getBoundingClientRect()
  if (rect.top >= 0) return;

  window.scrollTo({
    top: window.scrollY + rect.top,
    behavior: 'instant',
  })
}

async function download(version: 'a' | 'b') {
  const content = await props.dr.getEntry(props.dr[version], props.track[version])
  if (!content) {
    Notify.error('Failed to download file.')
    return;
  }
  saveAs(new Blob([content]), basename(props.track[version]))
}

async function copy(version: 'a' | 'b') {
  const content = await props.dr.getEntry(props.dr[version], props.track[version])
  if (!content) {
    Notify.error('Failed to copy file to clipboard.')
    return;
  }
  try {
    await copyFunc.value?.(content)
    Notify.success({
      duration: 2000,
      content: 'File copied to clipboard.',
    })
  } catch (err: any) {
    Notify.error(() => <>
      <p>Failed to copy file to clipboard.</p>
      <p>{ err?.message ?? err?.toString?.() ?? 'Unknown error.' }</p>
    </>)
    console.error(err)
  }
}
</script>

<template>
  <div
    ref="deltaTrack"
    class="delta-track"
    :class="{ expanded }"
    :key="track.id"
    @pointerenter="interacted = true"
    @focusin="interacted = true"
  >
    <div class="delta-track-bar">
      <IconButton @click="expanded = !expanded" style="align-self: flex-start;">
        <ChevronDown20Filled :style="{
          transition: 'rotate .2s',
          rotate: expanded ? '180deg' : '0deg'
        }" />
      </IconButton>

      <TrackTag
        v-if="track.state === DeltaTrackState.Added"
        color="var(--color-success)"
        @click="expanded = !expanded"
      >Added</TrackTag>
      <TrackTag
        v-else-if="track.state === DeltaTrackState.Removed"
        color="var(--color-danger)"
        @click="expanded = !expanded"
      >Removed</TrackTag>
      <Col
        v-else-if="track.state === DeltaTrackState.Moved"
        align="flex-end"
        @click="expanded = !expanded"
        style="cursor: pointer;"
      >
        <TrackTag color="var(--color-5)">Moved</TrackTag>
        <ArrowTurnRight20Filled style="transform: scaleY(-1); width: 20px; height: 20px;" />
      </Col>
      <TrackTag
        v-else
        color="var(--color-accent)"
        @click="expanded = !expanded"
        :border-alpha="0.7"
      >Edited</TrackTag>
      <Col v-if="track.state === DeltaTrackState.Moved" align="stretch" style="overflow: hidden;">
        <MarkFilePathChanges
          :original="track.a"
          :modified="track.b"
        />
      </Col>
      <FilePath v-else :path="track.id"/>
      <div v-if="track.state === DeltaTrackState.Moved" style="min-width: 16px;"></div>
      <SizeDiff
          v-else
        :diff="track.sizeDiff"
        :style="{
          userSelect: 'none',
          pointerEvents: 'none',
          minWidth: 'fit-content',
        }"
      />
      <div class="delta-track-spacer" @click="expanded = !expanded"></div>
      <div v-if="interacted" class="delta-track-action-buttons">
        <Tooltip v-if="
          copyFunc && (
            track.state === DeltaTrackState.Removed ||
            track.state === DeltaTrackState.Edited
          )
        ">
          <template #trigger="{ props }">
            <IconButton v-bind="props" class="accent" @click="copy('a')">
              <Copy24Regular />
            </IconButton>
          </template>
          <h3>Copy to clipboard</h3>
          <p><b>{{ basename(track.a) }}</b> from <b>{{ dr.a }}</b></p>
        </Tooltip>
        <Tooltip v-if="track.state === DeltaTrackState.Removed || track.state === DeltaTrackState.Edited">
          <template #trigger="{ props }">
            <IconButton v-bind="props" class="accent" @click="download('a')">
              <ArrowDownload24Regular />
            </IconButton>
          </template>
          <h3>Download</h3>
          <p><b>{{ basename(track.a) }}</b> from <b>{{ dr.a }}</b></p>
        </Tooltip>
        <Tooltip v-if="
          copyFunc && (
            track.state === DeltaTrackState.Added ||
            track.state === DeltaTrackState.Edited ||
            track.state === DeltaTrackState.Moved
          )
        ">
          <template #trigger="{ props }">
            <IconButton v-bind="props" class="accent" @click="copy('b')">
              <Copy24Regular />
            </IconButton>
          </template>
          <h3>Copy to clipboard</h3>
          <p><b>{{ basename(track.b) }}</b> from <b>{{ dr.b }}</b></p>
        </Tooltip>
        <Tooltip v-if="
          track.state === DeltaTrackState.Added ||
          track.state === DeltaTrackState.Edited ||
          track.state === DeltaTrackState.Moved
        ">
          <template #trigger="{ props }">
            <IconButton v-bind="props" class="accent" @click="download('b')">
              <ArrowDownload24Regular />
            </IconButton>
          </template>
          <h3>Download</h3>
          <p><b>{{ basename(track.b) }}</b> from <b>{{ dr.b }}</b></p>
        </Tooltip>
      </div>
    </div>

    <div
      v-if="shouldRenderContent"
      class="delta-track-detail"
      :style="{
        minHeight: (expanded && isInitialAutoExpanded) ? `${viewer?.predictedHeight ?? 0}px` : undefined
      }"
    >
      <AnimatedHeight
        :show="expanded"
        :immediate-init="isInitialRender"
        @end="handleAnimationEnd"
      >
        <Content :content="view"/>
      </AnimatedHeight>
    </div>
  </div>
</template>

<style lang="scss" scoped>

@property --border-radius {
  syntax: '<length>';
  inherits: true;
  initial-value: 0;
}

@property --border-top-radius {
  syntax: '<length>';
  inherits: true;
  initial-value: 0;
}

@property --border-bottom-radius {
  syntax: '<length>';
  inherits: true;
  initial-value: 0;
}

.delta-track {
  --border-radius: 6px;
  --border-top-radius: 16px;
  --border-bottom-radius: 16px;
  background-color: var(--color-1);
  margin-bottom: 4px;
  border: 1px solid rgb(from var(--color-5) r g b / 0.1);
  border-top-left-radius: var(--border-top-radius);
  border-top-right-radius: var(--border-top-radius);
  border-bottom-left-radius: var(--border-bottom-radius);
  border-bottom-right-radius: var(--border-bottom-radius);
  position: relative;
  transition: --border-bottom-radius .5s;
  overflow: clip;
  padding: 1px;
  max-width: 100cqw;

  &::after {
    content: '';
    position: absolute;
    inset: 0px;
    border-radius: var(--border-radius);
    border-top-left-radius: var(--border-top-radius);
    border-top-right-radius: var(--border-top-radius);
    border-bottom-left-radius: var(--border-bottom-radius);
    border-bottom-right-radius: var(--border-bottom-radius);
    border: 1px solid var(--color-1);
    pointer-events: none;
    z-index: 1;
  }

  &.expanded {
    --border-bottom-radius: 6px;
  }

  .delta-track-spacer {
    flex: 1;
    align-self: stretch;
    cursor: pointer;
    user-select: none;
  }

  .delta-track-action-buttons {
    display: flex;
    align-items: center;
    gap: 2px;
    align-self: flex-start;
    position: static;
    right: 1px;
    transition: opacity .2s ease-out;
  }

  &:not(:hover) .delta-track-action-buttons {
    position: absolute;
    opacity: 0;
  }
}

.delta-track-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  position: sticky;
  top: 0;
  z-index: 50;
  background-color: inherit;
  min-width: 0;
  margin: -1px;
  padding: 1px;
}

.delta-track-expand-button {
  cursor: pointer;
  user-select: none;
  min-width: 36px;
  max-width: 36px;
  height: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 4px;
  box-sizing: border-box;

  &:hover {
    animation: pulse 4s infinite;
    background-image: radial-gradient(
      farthest-corner at bottom center,
      rgb(from var(--color-accent) r g b / calc(alpha * var(--alpha))),
      transparent
    );
    border: 1px solid rgb(from var(--color-accent) r g b / calc(alpha * 0.5));
    box-shadow: 0 0 4px rgb(from var(--color-accent) r g b / calc(alpha * 0.5));
  }

  &>* {
    transition: rotate 200ms;
  }
}

.delta-track-detail {
  --background-color: var(--color-0-alt);
  border-top: 2px solid var(--color-1);
  background-color: var(--background-color);
  border-radius: 4px;
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  overflow: hidden;
}

</style>
