<script setup lang="ts">
import { ref, computed, watch, onUnmounted, inject } from 'vue'
import DeltaTrack from './DeltaTrack.vue'
import type { DeltaResult, DeltaTrack as DeltaTrackType } from '@/delta_providers'
import { getViewer } from '@/viewers/registry.ts'
import { DeltaTrackState } from '@/delta_providers/states'

const props = defineProps<{
  dr: DeltaResult
  track: DeltaTrackType
  observer: IntersectionObserver
}>()

const { markTrackMounted, isTrackMounted } = inject<{
  markTrackMounted: (t: DeltaTrackType) => void
  isTrackMounted: (t: DeltaTrackType) => boolean
}>('bitree-mount')!

const leafRef = ref<HTMLElement | null>(null)

const isMounted = computed(() => isTrackMounted(props.track))

function triggerMount() {
  markTrackMounted(props.track)
}

const trackHeight = computed(() => {
  const t = props.track
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

  return `${h}px`
})

watch([leafRef, isMounted], ([newEl, mountedState], [oldEl]) => {
  if (oldEl) props.observer.unobserve(oldEl)
  else if (newEl) props.observer.unobserve(newEl)
  if (newEl && !mountedState) props.observer.observe(newEl)
}, { immediate: true })

onUnmounted(() => {
  if (leafRef.value) {
    props.observer.unobserve(leafRef.value)
  }
})
</script>

<template>
  <div
    ref="leafRef"
    class="bitree-leaf"
    :class="{ mounted: isMounted }"
    :data-track="track.id"
    :style="{
      containIntrinsicSize: `auto ${trackHeight}`,
      height: isMounted ? undefined : trackHeight,
    }"
    @lazy-mount="triggerMount"
  >
    <DeltaTrack v-if="isMounted" :dr="dr" :track="track" />
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
}

.bitree-leaf.mounted {
  content-visibility: auto;
}

.bitree-branch {
  contain: layout;
}

</style>
