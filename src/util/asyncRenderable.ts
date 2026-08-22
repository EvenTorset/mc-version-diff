import {
  defineComponent,
  h,
  type Component,
} from 'vue'
import Content from '@/components/Content.vue'
import type { Renderable } from '@/types'

export function asyncRenderable(
  contentPromise: Promise<Renderable> | Renderable,
): Component {
  return defineComponent({
    name: 'AsyncRenderable',

    async setup() {
      if (typeof contentPromise === 'function') {
        //@ts-ignore
        const content = await contentPromise()
        return () => h(Content, { content })
      }

      const content = await contentPromise
      return () => h(Content, { content })
    },
  })
}
