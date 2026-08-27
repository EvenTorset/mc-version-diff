<script setup lang="tsx">
import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import FilePath from '@/components/FilePath.vue'
import Row from '@/components/Row.vue'
import { NButton, NIcon, NTag } from 'naive-ui'
import { ArrowDownload24Regular, ArrowTurnRight20Filled, ChevronDown20Filled, Copy24Regular } from '@vicons/fluent'
import { onMounted, ref, shallowRef, watch } from 'vue'
import AnimatedHeight from './AnimatedHeight.vue'
import Content from '@/components/Content.vue'
import { getViewer } from '@/viewers/registry.ts'
import Dim from './Dim.vue'
import type { Renderable } from '@/types.ts'
import { DeltaTrackState } from '@/delta_providers/states.ts'
import Spacer from './Spacer.vue'
import Col from './Col.vue'
import MarkFilePathChanges from './MarkFilePathChanges.vue'
import { IS_FIREFOX } from '@/util/isFirefox.ts'
import { basename } from '@/util/path.ts'
import { saveAs } from 'file-saver'
import Tooltip from './Tooltip.vue'
import { copyToClipboard } from '@/util/clipboard.ts'
import { computed } from 'vue'
import Notify from '@/notify.tsx'

const props = defineProps<{
  track: DeltaTrack
  dr: DeltaResult
}>()

const category = computed(() => props.dr.getCategory(props.track))

const initExpanded = (
  (
    props.track.state === DeltaTrackState.Added
    || props.track.state === DeltaTrackState.Edited
  )
  && (category.value?.expand ?? false)
)

const deltaTrack = ref<HTMLDivElement>()
const expanded = ref(initExpanded)
const isInitialAutoExpanded = ref(initExpanded)
const isInitialRender = ref(initExpanded)
const shouldRenderContent = ref(initExpanded)

const viewer = getViewer(props.dr, props.track)
const view = shallowRef<Renderable>()

function defaultViewer() {
  return <Dim style="padding: 4px;"><i>No viewer is registered for this file type.</i></Dim>
}

let renderPromise: Promise<Renderable> | undefined
function renderView() {
  renderPromise ??= (async () => {
    try {
      return (await viewer?.render(props.dr, props.track)) ?? defaultViewer
    } catch (err) {
      renderPromise = undefined
      throw err
    }
  })()
  return renderPromise
}

watch(expanded, async (isExpanded) => {
  isInitialAutoExpanded.value = false

  if (!isExpanded) return;
  shouldRenderContent.value = true
  view.value = await renderView()
})

function handleAnimationEnd() {
  if (!expanded.value) {
    shouldRenderContent.value = false
  } else {
    if (!isInitialAutoExpanded.value) {
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
    await copyToClipboard(content, category.value?.mimeType?.(props.track[version]) ?? 'text/plain')
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
  <div ref="deltaTrack" class="delta-track" :class="{ expanded }" :key="track.id">
    <Row class="delta-track-bar" gap="8px">
      <NButton class="icon" circle size="small" @click="expanded = !expanded" style="align-self: flex-start;">
        <template #icon>
          <ChevronDown20Filled :style="{
            transition: 'rotate .2s',
            rotate: expanded ? '180deg' : '0deg'
          }" />
        </template>
      </NButton>

      <NTag
        v-if="track.state === DeltaTrackState.Added"
        round
        size="small"
        :style="{ minWidth: '80px', maxWidth: '80px' }"
        :color="{
          color: 'rgb(from var(--color-success) r g b / 0.25)',
          textColor: 'oklch(from var(--color-success) calc(l * 1.3) calc(c * 0.7) h)',
          borderColor: 'rgb(from var(--color-success) r g b / 0.4)',
        }"
      >Added</NTag>
      <NTag
        v-else-if="track.state === DeltaTrackState.Removed"
        round
        size="small"
        :style="{ minWidth: '80px', maxWidth: '80px' }"
        :color="{
          color: 'rgb(from var(--color-danger) r g b / 0.25)',
          textColor: 'oklch(from var(--color-danger) calc(l * 1.3) calc(c * 0.7) h)',
          borderColor: 'rgb(from var(--color-danger) r g b / 0.4)',
        }"
      >Removed</NTag>
      <Col v-else-if="track.state === DeltaTrackState.Moved" align="flex-end">
        <NTag
          round
          size="small"
          :style="{ minWidth: '80px', maxWidth: '80px' }"
          :color="{
            color: 'rgb(from var(--color-5) r g b / 0.25)',
            textColor: 'oklch(from var(--color-5) calc(l * 1.3) calc(c * 0.7) h)',
            borderColor: 'rgb(from var(--color-5) r g b / 0.4)',
          }"
        >Moved</NTag>
        <NIcon :component="ArrowTurnRight20Filled" style="transform: scaleY(-1);" :size="20"/>
      </Col>
      <NTag
        v-else
        round
        size="small"
        :style="{ minWidth: '80px', maxWidth: '80px' }"
        :color="{
          color: 'rgb(from var(--color-accent) r g b / 0.25)',
          textColor: 'oklch(from var(--color-accent) calc(l * 1.3) calc(c * 0.7) h)',
          borderColor: 'rgb(from var(--color-accent) r g b / 0.7)',
        }"
      >Edited</NTag>
      <Col v-if="track.state === DeltaTrackState.Moved" align="stretch" style="overflow: hidden;">
        <MarkFilePathChanges
          :original="track.a"
          :modified="track.b"
        />
      </Col>
      <FilePath v-else :path="track.id"/>
      <div style="width: 16px;"></div>
      <Spacer style="align-self: stretch; cursor: pointer; user-select: none;" @click="expanded = !expanded"/>
      <Row gap="2px" style="align-self: flex-start;" class="delta-track-action-buttons">
        <Tooltip v-if="
          category?.mimeType && (
            track.state === DeltaTrackState.Removed ||
            track.state === DeltaTrackState.Edited
          )
        ">
          <template #trigger="{ props }">
            <NButton
              v-bind="props"
              class="icon accent"
              circle
              size="small"
              @click="copy('a')"
            >
              <template #icon>
                <Copy24Regular />
              </template>
            </NButton>
          </template>
          <h3>Copy to clipboard</h3>
          <p><b>{{ basename(track.a) }}</b> from <b>{{ dr.a }}</b></p>
        </Tooltip>
        <Tooltip v-if="track.state === DeltaTrackState.Removed || track.state === DeltaTrackState.Edited">
          <template #trigger="{ props }">
            <NButton
              v-bind="props"
              class="icon accent"
              circle
              size="small"
              @click="download('a')"
            >
              <template #icon>
                <ArrowDownload24Regular />
              </template>
            </NButton>
          </template>
          <h3>Download</h3>
          <p><b>{{ basename(track.a) }}</b> from <b>{{ dr.a }}</b></p>
        </Tooltip>
        <Tooltip v-if="
          category?.mimeType && (
            track.state === DeltaTrackState.Added ||
            track.state === DeltaTrackState.Edited ||
            track.state === DeltaTrackState.Moved
          )
        ">
          <template #trigger="{ props }">
            <NButton
              v-bind="props"
              class="icon accent"
              circle
              size="small"
              @click="copy('b')"
            >
              <template #icon>
                <Copy24Regular />
              </template>
            </NButton>
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
            <NButton
              v-bind="props"
              class="icon accent"
              circle
              size="small"
              @click="download('b')"
            >
              <template #icon>
                <ArrowDownload24Regular />
              </template>
            </NButton>
          </template>
          <h3>Download</h3>
          <p><b>{{ basename(track.b) }}</b> from <b>{{ dr.b }}</b></p>
        </Tooltip>
      </Row>
    </Row>

    <div
      v-if="shouldRenderContent"
      class="delta-track-detail"
      :style="{
        minHeight: (expanded && isInitialAutoExpanded) ? `${viewer?.predictedHeight ?? 0}px` : undefined
      }"
    >
      <AnimatedHeight
        :show="expanded"
        :duration="isInitialRender || !IS_FIREFOX ? 0 : 200"
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

  .delta-track-action-buttons {
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
  position: sticky;
  top: 0;
  z-index: 3;
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
