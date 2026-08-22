import type { Component, VNode } from 'vue'

export type SingleOrArray<T> = T | T[]
export type StaticRenderableContent = string | VNode | undefined | null | ImageBitmap
export type ComponentOrStaticRenderableContent = StaticRenderableContent | Component
export type Renderable = SingleOrArray<
 | ComponentOrStaticRenderableContent
 | (() => ComponentOrStaticRenderableContent)
>

export interface TooltipTriggerProps {
  props: Record<string, unknown>
}

export type ImageViewMode =
  | 'rgba'
  | 'rgb'
  | 'r'
  | 'g'
  | 'b'
  | 'a'

export type TooltipSide = 'above' | 'below' | 'left' | 'right'
