import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

const observers = new Map<string, {
  observer: IntersectionObserver
  callbacks: Map<Element, (visible: boolean) => void>
}>()

function getObserver(options: IntersectionObserverInit) {
  const key = JSON.stringify(options)
  let entry = observers.get(key)
  if (!entry) {
    const callbacks = new Map<Element, (visible: boolean) => void>()
    const observer = new IntersectionObserver(entries => {
      for (const e of entries) callbacks.get(e.target)?.(e.isIntersecting)
    }, options)
    entry = { observer, callbacks }
    observers.set(key, entry)
  }
  return entry
}

export function useElementVisible(
  target: Ref<Element | undefined>,
  options: IntersectionObserverInit = { rootMargin: '200px' }
): Ref<boolean> {
  const visible = ref(false)
  let entry: ReturnType<typeof getObserver> | null = null
  let observed: Element | null = null

  onMounted(() => {
    if (!target.value) return;
    entry = getObserver(options)
    observed = target.value
    entry.callbacks.set(observed, v => { visible.value = v })
    entry.observer.observe(observed)
  })

  onBeforeUnmount(() => {
    if (entry && observed) {
      entry.observer.unobserve(observed)
      entry.callbacks.delete(observed)
    }
  })

  return visible
}
