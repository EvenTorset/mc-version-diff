import { defineAsyncComponent } from 'vue'

const loadTextView = () => import('./TextView.vue')
const loadTextDiff = () => import('./TextDiff.vue')

export const TextView = defineAsyncComponent(loadTextView)
export const TextDiff = defineAsyncComponent(loadTextDiff)

let prefetched = false

export function prefetchTextViews() {
  if (prefetched) return
  prefetched = true

  const warm = () => {
    loadTextView().catch(() => {})
    loadTextDiff().catch(() => {})
  }

  requestAnimationFrame(() => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 10_000 })
    else setTimeout(warm, 3000)
  })
}
