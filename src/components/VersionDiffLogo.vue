<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

withDefaults(defineProps<{
  weight?: number
}>(), {
  weight: 1
})

const svg = ref<HTMLElement>()
const strokeWidth = ref<number>(10)
let observer: ResizeObserver
onMounted(() => {
  if (!svg.value) return;
  observer = new ResizeObserver(([entry]) => {
    strokeWidth.value = 3072 / entry.borderBoxSize[0].blockSize
  })
  observer.observe(svg.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <div class="logo">
     <svg ref="svg" xmlns="http://www.w3.org/2000/svg" xml:space="preserve" viewBox="0 0 1024 1024">
      <defs>
        <path
          id="shape"
          d="
            M443.2 44.9
            .5 896.4
            128.1 0
            z

            M907 949.2
            l117-821.7
            l-580.8-82.6
            z

            M907 949.2
            l-10.6 74.7
            l-527.9-74.6
            z
          "
        />

        <radialGradient id="fillGradient" gradientTransform="translate(-0.5 0) scale(2, 2)">
          <stop offset="0%" stop-color="#4280ff"/>
          <stop offset="8.33%" stop-color="rgba(62, 125, 255, 0.93)"/>
          <stop offset="16.67%" stop-color="rgba(59, 123, 255, 0.86)"/>
          <stop offset="25%" stop-color="rgba(55, 120, 255, 0.79)"/>
          <stop offset="33.33%" stop-color="rgba(51, 118, 255, 0.72)"/>
          <stop offset="41.67%" stop-color="rgba(48, 115, 255, 0.65)"/>
          <stop offset="50%" stop-color="rgba(44, 112, 255, 0.57)"/>
          <stop offset="58.33%" stop-color="rgba(40, 109, 255, 0.5)"/>
          <stop offset="66.67%" stop-color="rgba(35, 107, 255, 0.43)"/>
          <stop offset="75%" stop-color="rgba(31, 104, 255, 0.36)"/>
          <stop offset="83.33%" stop-color="rgba(26, 101, 255, 0.29)"/>
          <stop offset="100%" stop-color="rgba(15, 95, 255, 0.15)"/>
        </radialGradient>

        <radialGradient id="strokeGradient" gradientTransform="translate(-0.5 -1) scale(2, 2)">
          <stop offset="0%" stop-color="#4280ff"/>
          <stop offset="8.33%" stop-color="rgba(62, 125, 255, 0.93)"/>
          <stop offset="16.67%" stop-color="rgba(59, 123, 255, 0.86)"/>
          <stop offset="25%" stop-color="rgba(55, 120, 255, 0.79)"/>
          <stop offset="33.33%" stop-color="rgba(51, 118, 255, 0.72)"/>
          <stop offset="41.67%" stop-color="rgba(48, 115, 255, 0.65)"/>
          <stop offset="50%" stop-color="rgba(44, 112, 255, 0.57)"/>
          <stop offset="58.33%" stop-color="rgba(40, 109, 255, 0.5)"/>
          <stop offset="66.67%" stop-color="rgba(35, 107, 255, 0.43)"/>
          <stop offset="75%" stop-color="rgba(31, 104, 255, 0.36)"/>
          <stop offset="83.33%" stop-color="rgba(26, 101, 255, 0.29)"/>
          <stop offset="100%" stop-color="rgba(15, 95, 255, 0.15)"/>
        </radialGradient>

        <clipPath id="insideClip">
          <use href="#shape"/>
        </clipPath>
      </defs>
      <use
        href="#shape"
        fill="url(#fillGradient)"
      />
      <use
        href="#shape"
        fill="none"
        stroke="url(#strokeGradient)"
        :stroke-width="strokeWidth"
        clip-path="url(#insideClip)"
      />
    </svg>
    <h1 :style="{
      fontWeight: `${200 * weight}`
    }">Version Diff</h1>
    <span :style="{
      fontWeight: `${500 * weight}`
    }">A Minecraft version comparison tool</span>
  </div>
</template>

<style lang="css" scoped>

.logo {
  position: relative;
  display: flex;
  align-items: center;
  font-size: min(2em, 3cqw);
  width: fit-content;
  height: fit-content;

  &>svg {
    fill: var(--color-accent);
    width: 5em;
    height: 5em;
    margin: 0 -1.41em 0 0;
  }

  &>h1 {
    color: var(--color-6);
    font-size: 3em;
    text-shadow: 0 3px var(--color-1);
    margin: 0;
    user-select: none;
    cursor: inherit;
    white-space: nowrap;
  }

  &>span {
    position: absolute;
    left: 5.9375em;
    bottom: 0;
    font-size: 0.8em;
    color: var(--color-4);
    user-select: none;
    cursor: inherit;
    white-space: nowrap;
  }
}

</style>
