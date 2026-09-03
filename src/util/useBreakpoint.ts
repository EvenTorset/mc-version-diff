import { ref, onMounted, onUnmounted, readonly, type DeepReadonly, type Ref } from 'vue'

interface BreakpointEntry {
  matches: Ref<boolean>
  mql: MediaQueryList | null
  listener: (e: MediaQueryListEvent) => void
  count: number
}

const breakpoints = new Map<string, BreakpointEntry>()

export function maxWidthQuery(value: string) {
  return `(max-width: ${value})` as const
}

export function useBreakpoint(query: string = maxWidthQuery('600px')): DeepReadonly<Ref<boolean>> {
  let entry = breakpoints.get(query)

  if (!entry) {
    const isClient = typeof window !== 'undefined'
    const mql = isClient ? window.matchMedia(query) : null
    const matches = ref(mql ? mql.matches : false)

    const listener = (e: MediaQueryListEvent): void => {
      matches.value = e.matches;
    }

    if (mql) {
      mql.addEventListener('change', listener)
    }

    entry = {
      matches,
      mql,
      listener,
      count: 0,
    }

    if (isClient) {
      breakpoints.set(query, entry)
    }
  }

  const currentEntry = entry

  onMounted(() => {
    currentEntry.count++
  })

  onUnmounted(() => {
    currentEntry.count--

    if (currentEntry.count <= 0 && currentEntry.mql) {
      currentEntry.mql.removeEventListener('change', currentEntry.listener)
      breakpoints.delete(query)
    }
  })

  return readonly(currentEntry.matches)
}
