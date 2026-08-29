import { computed, onMounted, onUnmounted, ref, shallowReactive, type Ref, type ShallowRef } from 'vue'

const FOCUS_LINE = 1 / 3

export const focusedTrack = ref('')

const tabs = shallowReactive(new Map<string, Ref<string>>())

export const focusedTab = computed(() => tabs.get(focusedTrack.value)?.value)

let initial: { track: string, tab?: string } | undefined
let pendingRestore: string | undefined
let held: string | undefined

export function initTrackFocus(track?: string, tab?: string) {
  tabs.clear()
  initial = track ? { track, tab } : undefined
  pendingRestore = track
  focusedTrack.value = track ?? ''
  held = track
}

export function isInitialFocus(id: string) {
  return initial?.track === id
}

export function holdFocus(id: string) {
  held = id
  focusedTrack.value = id
}

export function trackTab(id: string, names: string[], fallback = names[0]) {
  const wanted = initial?.track === id ? initial.tab : undefined
  const tab = ref(wanted && names.includes(wanted) ? wanted : fallback)
  tabs.set(id, tab)
  return tab
}

function trackElement(root: HTMLElement, id: string) {
  return root.querySelector(`[data-track="${CSS.escape(id)}"]`)
}

function onScreen(el: Element) {
  const rect = el.getBoundingClientRect()
  return rect.bottom > 0 && rect.top < window.innerHeight
}

function focusLine() {
  return window.innerHeight * FOCUS_LINE
}

export function useTrackFocus(root: Readonly<ShallowRef<HTMLElement | null>>) {
  let frame = 0
  let restoring = false

  function update() {
    const el = root.value
    if (!el || restoring) return;

    if (held) {
      const heldEl = trackElement(el, held)
      if (heldEl && onScreen(heldEl)) return;
      held = undefined
    }

    const rect = el.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, focusLine())
    const id = hit?.closest('[data-track]')?.getAttribute('data-track')
    if (id) focusedTrack.value = id
  }

  function onScroll() {
    frame ||= requestAnimationFrame(() => {
      frame = 0
      update()
    })
  }

  async function restore(id: string) {
    restoring = true
    const cancel = () => restoring = false
    const listeners = ['wheel', 'touchmove', 'keydown'] as const
    for (const name of listeners) window.addEventListener(name, cancel, { once: true, passive: true })

    let stable = 0
    for (let i = 0; i < 200 && restoring && stable < 10; i++) {
      const el = root.value && trackElement(root.value, id)
      if (el) {
        const top = Math.max(0, window.scrollY + el.getBoundingClientRect().top - focusLine())
        if (Math.abs(top - window.scrollY) < 1) {
          stable++
        } else {
          stable = 0
          window.scrollTo({ top })
        }
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    restoring = false
    for (const name of listeners) window.removeEventListener(name, cancel)
  }

  function resync() {
    if (restoring) return;
    held = undefined
    focusedTrack.value = ''
    requestAnimationFrame(update)
  }

  onMounted(() => {
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    if (pendingRestore) {
      restore(pendingRestore)
      pendingRestore = undefined
    }
  })

  onUnmounted(() => {
    cancelAnimationFrame(frame)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
  })

  return { resync }
}
