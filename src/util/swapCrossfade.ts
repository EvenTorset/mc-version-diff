const CROSS_MS = 750
const CROSS_PX = 30
const CROSS_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

export type Leaving = { clone: HTMLElement, from: DOMRect }

export function useSwapCrossfade(root: () => HTMLElement | undefined) {
  let running = new AbortController()
  let clones: HTMLElement[] = []
  let entered: HTMLElement[] = []

  function capture(cards: HTMLElement[]): Leaving[] {
    return cards.map(card => ({ clone: card.cloneNode(true) as HTMLElement, from: card.getBoundingClientRect() }))
  }

  function cancel() {
    running.abort()
    running = new AbortController()
    for (const clone of clones) clone.remove()
    clones = []
    for (const card of entered) {
      card.style.transition = ''
      card.style.transform = ''
      card.style.opacity = ''
    }
    entered = []
  }

  function fade(clone: HTMLElement, from: DOMRect, inward: number) {
    const base = root()!.getBoundingClientRect()
    Object.assign(clone.style, {
      transition: 'none',
      transform: 'none',
      position: 'absolute',
      left: `${from.left - base.left}px`,
      top: `${from.top - base.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      boxSizing: 'border-box',
      margin: '0',
      pointerEvents: 'none',
    })
    clone.inert = true
    root()!.append(clone)
    clones.push(clone)

    clone.getBoundingClientRect()

    clone.style.transition = `transform ${CROSS_MS}ms ${CROSS_EASE}, opacity ${CROSS_MS}ms ${CROSS_EASE}`
    clone.style.transform = `translateX(${inward}px)`
    clone.style.opacity = '0'
    setTimeout(() => clone.remove(), CROSS_MS + 100)
  }

  function enter(card: HTMLElement, inward: number) {
    card.style.transition = 'none'
    card.style.transform = `translateX(${inward}px)`
    card.style.opacity = '0'
    entered.push(card)

    root()!.getBoundingClientRect()

    card.style.transition = `transform ${CROSS_MS}ms ${CROSS_EASE}, opacity ${CROSS_MS}ms ${CROSS_EASE}`
    card.style.transform = ''
    card.style.opacity = ''
    card.addEventListener('transitionend', event => {
      if (event.target !== card || event.propertyName !== 'transform') return;
      card.style.transition = ''
    }, { signal: running.signal })
  }

  function play(leaving: Leaving[], entering: HTMLElement[]) {
    for (const [ i, card ] of entering.entries()) {
      const inward = i === 0 ? CROSS_PX : -CROSS_PX
      fade(leaving[i].clone, leaving[i].from, inward)
      enter(card, inward)
    }
  }

  return { capture, cancel, play }
}
