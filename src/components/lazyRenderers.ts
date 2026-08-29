import { defineAsyncComponent } from 'vue'

const loadItemIcon = () => import('./ItemIcon.vue')
const loadModelViewer = () => import('./ModelViewer.vue')
const loadTextureAnimation = () => import('./TextureAnimation.vue')

export const ItemIcon = defineAsyncComponent(loadItemIcon)
export const ModelViewer = defineAsyncComponent(loadModelViewer)
export const TextureAnimation = defineAsyncComponent(loadTextureAnimation)

let prefetched = false

export function prefetchRenderers() {
  if (prefetched) return
  prefetched = true

  const warm = () => {
    loadItemIcon().catch(() => {})
    loadModelViewer().catch(() => {})
    loadTextureAnimation().catch(() => {})
  }

  requestAnimationFrame(() => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 10_000 })
    else setTimeout(warm, 3000)
  })
}
