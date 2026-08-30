<script setup lang="ts">
import { provide, ref, onUnmounted, shallowRef, watch, h, computed, type VNode } from 'vue'
import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import TreeLeaf from './TreeListLeaf.vue'
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

function retireTrack(t: DeltaTrack) {
  mountedTrackKeys.value.delete(t.id)
}

function isTrackMounted(t: DeltaTrack): boolean {
  return mountedTrackKeys.value.has(t.id)
}

provide('tree-list-mount', {
  markTrackMounted,
  retireTrack,
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

const retireObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) {
      const el = entry.target as HTMLElement
      el.dispatchEvent(new CustomEvent('lazy-retire', { detail: entry.boundingClientRect.height }))
    }
  }
}, {
  root: null,
  rootMargin: '2400px 0px 2400px 0px',
  threshold: 0,
})

onUnmounted(() => {
  observer.disconnect()
  retireObserver.disconnect()
})

const BRANCH_FACTOR = 8

function buildBranch(dr: DeltaResult, tracks: DeltaTrack[], lo: number, hi: number): VNode {
  if (hi - lo === 1) {
    const track = tracks[lo]
    return h(TreeLeaf, { key: track.id, dr, track, observer, retireObserver })
  }

  const children: VNode[] = []
  let step = 1
  while (step * BRANCH_FACTOR < hi - lo) step *= BRANCH_FACTOR
  for (let start = lo; start < hi; start += step) {
    children.push(buildBranch(dr, tracks, start, Math.min(start + step, hi)))
  }

  return h('div', {
    class: 'tree-list-branch',
    key: `${tracks[lo].id}:${tracks[hi - 1].id}:${hi - lo}`,
  }, children)
}

const tree = computed(() => {
  const tracks = props.dr.tracks
  if (tracks.length === 0) return null
  return buildBranch(props.dr, tracks, 0, tracks.length)
})

const Tree = () => tree.value
</script>

<template>
  <div class="tree-list-root" ref="root">
    <Tree />
  </div>
</template>

<style>

.tree-list-root {
  width: 100%;
}

</style>
