<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { codePoint, GLYPH_SCALE, glyphUrl, glyphWidth, type Glyph } from '@/util/unifont'

const props = defineProps<{
  glyphs: Glyph[]
}>()

const CELL = 72
const ROW_HEIGHT = 64

const container = ref<HTMLElement | null>(null)
const columns = ref(1)

let observer: ResizeObserver | null = null

onMounted(() => {
  if (!container.value) return
  observer = new ResizeObserver(([ entry ]) => {
    columns.value = Math.max(1, Math.floor(entry.contentRect.width / CELL))
  })
  observer.observe(container.value)
})

onBeforeUnmount(() => observer?.disconnect())

const rows = computed(() => {
  const out: Glyph[][] = []
  for (let i = 0; i < props.glyphs.length; i += columns.value) out.push(props.glyphs.slice(i, i + columns.value))
  return out
})

const virtualizer = useVirtualizer({
  get count() {
    return rows.value.length
  },
  getScrollElement: () => container.value,
  estimateSize: () => ROW_HEIGHT,
  overscan: 4,
})

const virtualRows = computed(() => virtualizer.value.getVirtualItems())
</script>

<template>
  <div ref="container" class="hex-glyphs">
    <div class="sizer" :style="{ height: `${virtualizer.getTotalSize()}px` }">
      <div
        v-for="row of virtualRows"
        :key="row.index"
        class="row"
        :style="{ height: `${row.size}px`, transform: `translateY(${row.start}px)` }"
      >
        <div v-for="glyph of rows[row.index]" :key="glyph.code" class="glyph" :style="{ width: `${CELL}px` }">
          <div class="marks">
            <div
              v-if="glyph.was"
              class="mark removed"
              :style="{ '--glyph': `url(${glyphUrl(glyph.was)})`, width: `${glyphWidth(glyph.was) * GLYPH_SCALE}px` }"
            />
            <div
              v-if="glyph.bitmap"
              class="mark"
              :style="{ '--glyph': `url(${glyphUrl(glyph.bitmap)})`, width: `${glyphWidth(glyph.bitmap) * GLYPH_SCALE}px` }"
            />
          </div>
          <div class="code">{{ codePoint(glyph.code) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>

.hex-glyphs {
  max-height: 460px;
  overflow-y: auto;
  padding: 8px 12px;
}

.sizer {
  position: relative;
  width: 100%;
}

.row {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  width: 100%;
}

.glyph {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-sizing: border-box;
  padding: 0 2px;
}

.marks {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
  height: 32px;
}

.mark {
  height: 32px;
  background-color: var(--color-6);
  mask-image: var(--glyph);
  mask-size: 100% 100%;
  -webkit-mask-image: var(--glyph);
  -webkit-mask-size: 100% 100%;
  image-rendering: pixelated;

  &.removed {
    background-color: var(--color-danger);
  }
}

.code {
  color: var(--color-dim);
  font-family: var(--monospace-font-family);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

</style>
