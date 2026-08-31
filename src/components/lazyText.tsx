import { NSkeleton } from 'naive-ui'
import { defineComponent, h, Suspense, defineAsyncComponent, type Component } from 'vue'

const loadTextView = () => import('./TextView.vue')
const loadTextDiff = () => import('./TextDiff.vue')

const AsyncTextView = defineAsyncComponent(loadTextView)
const AsyncTextDiff = defineAsyncComponent(loadTextDiff)

function withSuspense<T extends Component>(AsyncComp: T): T {
  return defineComponent({
    name: 'SuspenseWrapper',
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () =>
        h(Suspense, null, {
          default: () => h(AsyncComp, attrs, slots),
          fallback: () => <div style="padding: 20px;">
            <NSkeleton text repeat={2} /> <NSkeleton text style='width: 60%' />
          </div>,
        })
    },
  }) as unknown as T
}

export const TextView = withSuspense(AsyncTextView)
export const TextDiff = withSuspense(AsyncTextDiff)

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
