<script setup lang="ts">
import { ref, computed, watch, onUnmounted, inject } from 'vue'
import DeltaTrack from './DeltaTrack.vue'
import type { DeltaResult, DeltaTrack as DeltaTrackType } from '@/delta_providers'
import { getViewer } from '@/viewers/registry.ts'
import { DeltaTrackState } from '@/delta_providers/states'

const props = defineProps<{
  dr: DeltaResult
  tracks: DeltaTrackType[]
  observer: IntersectionObserver
}>()

const { markTrackMounted, isTrackMounted } = inject<{
  markTrackMounted: (t: DeltaTrackType) => void
  isTrackMounted: (t: DeltaTrackType) => boolean
}>('bitree-mount')!

const isLeaf = computed(() => props.tracks.length === 1)
const track = computed(() => props.tracks[0])

const mid = computed(() => Math.floor(props.tracks.length / 2))
const leftTracks = computed(() => props.tracks.slice(0, mid.value))
const rightTracks = computed(() => props.tracks.slice(mid.value))

const leafRef = ref<HTMLElement | null>(null)

const isMounted = computed(() => {
  if (!isLeaf.value || !track.value) return false
  return isTrackMounted(track.value)
})

function triggerMount() {
  if (track.value) {
    markTrackMounted(track.value)
  }
}

function getBranchKey(tracksList: DeltaTrackType[]): string {
  if (tracksList.length === 0) return ''
  if (tracksList.length === 1) return tracksList[0].id
  return `${tracksList[0].id}:${tracksList[tracksList.length - 1].id}:${tracksList.length}`
}

function getTrackHeight(t: DeltaTrackType | undefined): string {
  if (!t) return '32px'
  let h = 32

  if (
    (
      t.state === DeltaTrackState.Added
      || t.state === DeltaTrackState.Edited
    )
    && (props.dr.getCategory(t)?.expand ?? false)
  ) {
    const ph = getViewer(props.dr, t)?.predictedHeight
    if (ph !== undefined) {
      h = ph + 34
    }
  }

  return typeof h === 'number' ? `${h}px` : h
}

const trackHeight = computed(() => getTrackHeight(track.value))

watch([leafRef, isLeaf, isMounted], ([newEl, leafState, mountedState], [oldEl]) => {
  if (oldEl && props.observer) {
    props.observer.unobserve(oldEl)
  }
  if (newEl && leafState && !mountedState && props.observer) {
    props.observer.observe(newEl)
  }
}, { immediate: true })

onUnmounted(() => {
  if (leafRef.value && props.observer) {
    props.observer.unobserve(leafRef.value)
  }
})
</script>

<template>
  <div
    v-if="isLeaf"
    ref="leafRef"
    class="bitree-leaf"
    :data-track="track.id"
    :style="{ containIntrinsicSize: `auto ${trackHeight}` }"
    @lazy-mount="triggerMount"
  >
    <div
      v-if="!isMounted"
      class="leaf-placeholder"
      :style="{ height: trackHeight }"
    ></div>
    <DeltaTrack v-else :dr="dr" :track="track" />
  </div>

  <div v-else class="bitree-branch">
    <BiTreeBranch
      v-if="leftTracks.length > 0"
      :key="getBranchKey(leftTracks)"
      :dr="dr"
      :tracks="leftTracks"
      :observer="observer"
    />
    <BiTreeBranch
      v-if="rightTracks.length > 0"
      :key="getBranchKey(rightTracks)"
      :dr="dr"
      :tracks="rightTracks"
      :observer="observer"
    />
  </div>
</template>

<style>

.bitree-branch,
.bitree-leaf {
  display: block;
  box-sizing: border-box;
  width: 100%;
}

.bitree-leaf {
  contain: layout style;
  content-visibility: auto;
}

.bitree-branch {
  contain: layout;
}

</style>
