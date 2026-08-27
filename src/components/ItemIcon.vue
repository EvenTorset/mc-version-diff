<script setup lang="ts">
import type { DeltaResult } from '@/delta_providers'
import { legacyAssetAlias } from '@/util/legacyItems'
import { useElementVisible } from '@/util/useElementVisible'
import { readFile, renderItem, versionAssets } from '@/util/blockModelRenderer'
import { ref, watchEffect } from 'vue'

const props = withDefaults(defineProps<{
  dr: DeltaResult
  version: string
  id: string
  components?: Record<string, any>
  size?: number
}>(), {
  size: 32,
})

const containerRef = ref<HTMLDivElement>()
const isVisible = useElementVisible(containerRef)
const icon = ref<ImageBitmap | null>(null)

const cache = new Map<string, Promise<ImageBitmap | null>>()

async function assetId(assets: any, id: string) {
  const [ ns, path ] = id.includes(':') ? id.split(':') : [ 'minecraft', id ]
  if (await readFile(`assets/${ns}/items/${path}.json`, assets)) return id
  if (await readFile(`assets/${ns}/models/item/${path}.json`, assets)) return id
  const alias = legacyAssetAlias(path)
  return alias ? `${ns}:${alias}` : id
}

async function render(dr: DeltaResult, version: string, id: string, components: Record<string, any> | undefined, size: number) {
  const assets = await versionAssets(dr, version)
  const canvas: HTMLCanvasElement | null = await renderItem({
    assets,
    width: size,
    height: size,
    id: await assetId(assets, id),
    components: components ?? {},
  })
  return canvas && createImageBitmap(canvas)
}

function load(dr: DeltaResult, version: string, id: string, components: Record<string, any> | undefined, size: number) {
  const key = `${version}|${id}|${JSON.stringify(components ?? null)}|${size}`
  if (!cache.has(key)) {
    cache.set(key, render(dr, version, id, components, size).catch(() => null))
  }
  return cache.get(key)!
}

watchEffect(async () => {
  if (!isVisible.value) return;

  const { dr, version, id, components, size } = props
  const bitmap = await load(dr, version, id, components, size)
  if (props.id === id && props.version === version) icon.value = bitmap
})

function draw(canvas: HTMLCanvasElement | null) {
  if (!canvas || !icon.value) return;
  const context = canvas.getContext('2d')
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(icon.value, 0, 0)
}
</script>

<template>
  <div ref="containerRef" class="item-icon" :style="{ width: `${size}px`, height: `${size}px` }">
    <canvas v-if="icon" :ref="el => draw(el as HTMLCanvasElement)" :width="size" :height="size" />
  </div>
</template>

<style lang="scss" scoped>

.item-icon {
  flex-shrink: 0;
}

canvas {
  display: block;
  image-rendering: pixelated;
}

</style>
