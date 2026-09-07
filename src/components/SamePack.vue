<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { DeltaResult } from '@/delta_providers'
import templateUrl from '@/assets/same_pack.jpg'
import overlayUrl from '@/assets/same_pack_overlay.png'
import defaultPackUrl from '@/assets/default_pack.png'

const props = defineProps<{
  dr: DeltaResult
}>()

const canvas = ref<HTMLCanvasElement>()

const LEFT = [144, 39, 508, 61, 391, 356, 7, 304]
const RIGHT = [598, 91, 1047, 163, 936, 478, 473, 397]
const SUBDIVISIONS = 24
const BLEED = 3

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = url
  })
}

async function packIcon(version: string) {
  try {
    const bytes = await props.dr.getEntry(version, 'pack.png')
    return await createImageBitmap(new Blob([bytes]))
  } catch {
    return await loadImage(defaultPackUrl)
  }
}

function projection(quad: number[]) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = quad
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3
  const det = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / det
  const h = (dx1 * dy3 - dx3 * dy1) / det
  const a = x1 - x0 + g * x1
  const b = x3 - x0 + h * x3
  const d = y1 - y0 + g * y1
  const e = y3 - y0 + h * y3
  return (u: number, v: number): [number, number] => {
    const w = g * u + h * v + 1
    return [(a * u + b * v + x0) / w, (d * u + e * v + y0) / w]
  }
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | ImageBitmap,
  src: [number, number][],
  dst: [number, number][],
) {
  const [[sx0, sy0], [sx1, sy1], [sx2, sy2]] = src
  const [[dx0, dy0], [dx1, dy1], [dx2, dy2]] = dst
  const sxA = sx1 - sx0, syA = sy1 - sy0, sxB = sx2 - sx0, syB = sy2 - sy0
  const dxA = dx1 - dx0, dyA = dy1 - dy0, dxB = dx2 - dx0, dyB = dy2 - dy0
  const det = sxA * syB - sxB * syA
  const a = (dxA * syB - dxB * syA) / det
  const b = (dyA * syB - dyB * syA) / det
  const c = (dxB * sxA - dxA * sxB) / det
  const d = (dyB * sxA - dyA * sxB) / det
  const e = dx0 - a * sx0 - c * sy0
  const f = dy0 - b * sx0 - d * sy0

  const cx = (dx0 + dx1 + dx2) / 3
  const cy = (dy0 + dy1 + dy2) / 3
  const bleed = (x: number, y: number): [number, number] => {
    const len = Math.hypot(x - cx, y - cy) || 1
    return [x + (x - cx) / len * BLEED, y + (y - cy) / len * BLEED]
  }

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(...bleed(dx0, dy0))
  ctx.lineTo(...bleed(dx1, dy1))
  ctx.lineTo(...bleed(dx2, dy2))
  ctx.closePath()
  ctx.clip()
  ctx.setTransform(a, b, c, d, e, f)
  ctx.drawImage(image, 0, 0)
  ctx.restore()
}

function drawProjected(target: CanvasRenderingContext2D, image: HTMLImageElement | ImageBitmap, quad: number[]) {
  const layer = document.createElement('canvas')
  layer.width = target.canvas.width
  layer.height = target.canvas.height
  const ctx = layer.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  const { width, height } = image
  const map = projection(quad)
  const n = SUBDIVISIONS
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n, v0 = j / n, v1 = (j + 1) / n
      const s: [number, number][] = [[u0 * width, v0 * height], [u1 * width, v0 * height], [u1 * width, v1 * height], [u0 * width, v1 * height]]
      const t: [number, number][] = [map(u0, v0), map(u1, v0), map(u1, v1), map(u0, v1)]
      drawTriangle(ctx, image, [s[0], s[1], s[3]], [t[0], t[1], t[3]])
      drawTriangle(ctx, image, [s[1], s[2], s[3]], [t[1], t[2], t[3]])
    }
  }
  target.drawImage(layer, 0, 0)
}

onMounted(async () => {
  const [template, overlay, left, right] = await Promise.all([
    loadImage(templateUrl),
    loadImage(overlayUrl),
    packIcon(props.dr.a),
    packIcon(props.dr.b),
  ])
  const el = canvas.value
  if (!el) return;
  el.width = template.width
  el.height = template.height
  const ctx = el.getContext('2d')!
  ctx.drawImage(template, 0, 0)
  ctx.globalAlpha = 0.95
  ctx.globalCompositeOperation = 'multiply'
  drawProjected(ctx, left, LEFT)
  drawProjected(ctx, right, RIGHT)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(overlay, 0, 0)
})
</script>

<template>
  <canvas ref="canvas" class="same-pack"></canvas>
</template>

<style lang="scss" scoped>

.same-pack {
  display: block;
  width: 100%;
  max-width: 480px;
  height: auto;
  margin-inline: auto;
  border-radius: 6px;
}

</style>
