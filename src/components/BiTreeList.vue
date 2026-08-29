<script setup lang="ts">
import { provide, ref, onUnmounted, shallowRef, watch } from 'vue'
import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import BiTreeBranch from './BiTreeBranch.vue'
import { useTrackFocus } from '@/util/trackFocus'

const props = defineProps<{
  dr: DeltaResult
}>()

const root = shallowRef<HTMLElement | null>(null)
const { resync } = useTrackFocus(root)

watch(() => props.dr.tracks, resync)

const mountedTrackKeys = ref(new Set<string | DeltaTrack>())

function markTrackMounted(t: DeltaTrack) {
  mountedTrackKeys.value.add(t.id)
}

function isTrackMounted(t: DeltaTrack): boolean {
  return mountedTrackKeys.value.has(t.id)
}

provide('bitree-mount', {
  markTrackMounted,
  isTrackMounted,
})

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      const el = entry.target as HTMLElement
      el.dispatchEvent(new CustomEvent('lazy-mount'))
    }
  }
}, {
  root: null,
  rootMargin: '800px 0px 800px 0px',
  threshold: 0,
})

onUnmounted(() => {
  observer.disconnect()
})
</script>

<template>
  <div class="bitree-root" ref="root">
    <BiTreeBranch
      v-if="dr.tracks.length > 0"
      :dr="dr"
      :tracks="dr.tracks"
      :observer="observer"
    />
  </div>
</template>

<style>

.bitree-root {
  width: 100%;
}

</style>
