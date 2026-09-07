<script setup lang="ts">
import { provide, ref, onUnmounted, shallowRef, watch, h, computed, inject, type VNode, type Ref } from 'vue'
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

const expandedTrackKeys = new Set<string>()

function setTrackExpanded(t: DeltaTrack, expanded: boolean) {
  if (expanded) expandedTrackKeys.add(t.id)
  else expandedTrackKeys.delete(t.id)
}

function wasTrackExpanded(t: DeltaTrack): boolean {
  return expandedTrackKeys.has(t.id)
}

const autoToggle = inject<Ref<'none' | 'expand' | 'collapse'>>('autoToggle')
watch(() => autoToggle?.value, t => {
  if (t === 'collapse') expandedTrackKeys.clear()
})

provide('tree-list-mount', {
  markTrackMounted,
  retireTrack,
  isTrackMounted,
  setTrackExpanded,
  wasTrackExpanded,
})

const FAST_SCROLL = 3
const SETTLE_DELAY = 120

const pendingMounts = new Set<HTMLElement>()
let lastScrollY = window.scrollY
let lastScrollTime = performance.now()
let scrollSpeed = 0
let settleTimer: ReturnType<typeof setTimeout> | undefined

function flushMounts() {
  for (const el of pendingMounts) el.dispatchEvent(new CustomEvent('lazy-mount'))
  pendingMounts.clear()
}

function onScroll() {
  const now = performance.now()
  const dt = now - lastScrollTime
  if (dt > 0) scrollSpeed = Math.abs(window.scrollY - lastScrollY) / dt
  lastScrollY = window.scrollY
  lastScrollTime = now
  clearTimeout(settleTimer)
  if (scrollSpeed < FAST_SCROLL) flushMounts()
  else settleTimer = setTimeout(() => {
    scrollSpeed = 0
    flushMounts()
  }, SETTLE_DELAY)
}

window.addEventListener('scroll', onScroll, { passive: true })

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const el = entry.target as HTMLElement
    if (!entry.isIntersecting) {
      pendingMounts.delete(el)
    } else if (scrollSpeed < FAST_SCROLL) {
      el.dispatchEvent(new CustomEvent('lazy-mount'))
    } else {
      pendingMounts.add(el)
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
  window.removeEventListener('scroll', onScroll)
  clearTimeout(settleTimer)
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
