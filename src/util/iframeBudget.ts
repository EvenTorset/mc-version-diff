import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

const LIMIT = 8

type Member = {
  el: () => HTMLElement | undefined
  active: Ref<boolean>
}

const members = new Set<Member>()
let timer: ReturnType<typeof setTimeout> | undefined

function distance(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  const centre = window.innerHeight / 2
  if (rect.bottom < centre) return centre - rect.bottom
  if (rect.top > centre) return rect.top - centre
  return 0
}

function update() {
  const ranked = Array.from(members)
    .map(member => ({ member, el: member.el() }))
    .filter((entry): entry is { member: Member, el: HTMLElement } => !!entry.el)
    .sort((a, b) => distance(a.el) - distance(b.el))
  ranked.forEach(({ member }, i) => {
    member.active.value = i < LIMIT
  })
}

function schedule() {
  timer ??= setTimeout(() => {
    timer = undefined
    update()
  }, 32)
}

export function useIframeBudget(el: Ref<HTMLElement | undefined>) {
  const active = ref(false)
  const member: Member = { el: () => el.value, active }

  onMounted(() => {
    if (members.size === 0) {
      window.addEventListener('scroll', schedule, { passive: true })
      window.addEventListener('resize', schedule, { passive: true })
    }
    members.add(member)
    schedule()
  })

  onBeforeUnmount(() => {
    members.delete(member)
    if (members.size === 0) {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      clearTimeout(timer)
      timer = undefined
    } else {
      schedule()
    }
  })

  return active
}
