import type { Renderable } from '@/types'
import { reactive, TransitionGroup, type VNode } from 'vue'
import Content from '@/components/Content.vue'

function onBeforeLeave(el: Element) {
  const htmlEl = el as HTMLElement
  htmlEl.style.height = `${htmlEl.getBoundingClientRect().height}px`
}

function onLeave(el: Element, done: () => void) {
  const htmlEl = el as HTMLElement
  void htmlEl.offsetHeight // force reflow

  htmlEl.style.height = '0px'

  htmlEl.addEventListener('transitionend', (e) => {
    if (e.target === htmlEl) {
      done()
    }
  }, { once: true })
}

export type ProgressList = (() => VNode) & {
  addItem(content: Renderable): symbol
  removeItem(id: symbol): void
}

export function createProgressList(): ProgressList {
  let items: Map<symbol, {
    id: symbol
    content: Renderable
  }> = reactive(new Map())

  return Object.assign(function() {
    return (
      <TransitionGroup
        name="progress-list"
        tag="div"
        onBeforeLeave={ onBeforeLeave }
        onLeave={ onLeave }
      >
        {Array.from(items.values()).map(item => (
          <div key={ item.id }>
            <Content content={ item.content }/>
          </div>
        ))}
      </TransitionGroup>
    )
  }, {
    addItem(content: Renderable): symbol {
      const id = Symbol()
      items.set(id, {
        id,
        content,
      })
      return id
    },
    removeItem(id: symbol) {
      items.delete(id)
    }
  })
}
