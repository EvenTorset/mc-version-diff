<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  duration?: number
  show?: boolean
}>(), {
  duration: 200,
  show: true,
})

const emit = defineEmits<{
  end: []
}>()

const wrapper = ref<HTMLDivElement>()
const content = ref<HTMLDivElement>()

let resizeObserver: ResizeObserver | undefined
let animationFrame = 0
let currentHeight = 0

function emitEnd() {
  emit('end')
}

function setHeight(targetHeight: number) {
  const el = wrapper.value
  if (!el) return;

  if (props.duration <= 0) {
    cancelAnimationFrame(animationFrame)
    el.style.height = props.show ? 'auto' : '0px'
    currentHeight = targetHeight
    emitEnd()
    return;
  }

  el.style.height = `${currentHeight}px`
  void el.offsetHeight // Force reflow

  cancelAnimationFrame(animationFrame)
  animationFrame = requestAnimationFrame(() => {
    if (!wrapper.value) return;
    wrapper.value.style.height = `${targetHeight}px`
    currentHeight = targetHeight
  })
}

function collapse() {
  const el = wrapper.value
  if (!el) return;

  if (props.duration <= 0) {
    el.style.height = '0px'
    emitEnd()
    return;
  }

  const startHeight = content.value?.getBoundingClientRect().height ?? currentHeight
  el.style.height = `${startHeight}px`

  void el.offsetHeight // Force reflow

  el.style.height = '0px'
}

function expand() {
  const el = wrapper.value
  if (!el || !content.value) return;

  const targetHeight = content.value.getBoundingClientRect().height
  currentHeight = targetHeight

  if (props.duration <= 0) {
    el.style.height = 'auto'
    emitEnd()
    return;
  }

  if (el.style.height === '' || el.style.height === '0px') {
    el.style.height = '0px'
    void el.offsetHeight // Force reflow
  }

  el.style.height = `${targetHeight}px`
}

watch(() => props.show, (shouldShow) => {
  if (shouldShow) {
    expand()
  } else {
    collapse()
  }
})

watch(() => props.duration, (newDuration) => {
  if (wrapper.value) {
    wrapper.value.style.transition = `height ${newDuration}ms ease`
    if (newDuration <= 0) {
      wrapper.value.style.height = props.show ? 'auto' : '0px'
    }
  }
})

onMounted(() => {
  const wrapperEl = wrapper.value!
  const contentEl = content.value!

  wrapperEl.style.overflow = 'hidden'

  if (!props.show) {
    wrapperEl.style.height = '0px'
    currentHeight = 0
  } else if (props.duration <= 0) {
    wrapperEl.style.transition = `height ${props.duration}ms ease`
    wrapperEl.style.height = 'auto'
    emitEnd()
  } else {
    wrapperEl.style.height = '0px'
    void wrapperEl.offsetHeight // Force reflow
    wrapperEl.style.transition = `height ${props.duration}ms ease`
    const rectHeight = contentEl.getBoundingClientRect().height
    currentHeight = rectHeight
    wrapperEl.style.height = `${rectHeight}px`
  }

  resizeObserver = new ResizeObserver((entries) => {
    if (!props.show) return;

    const box = entries[0].borderBoxSize?.[0]
    const newHeight = box ? box.blockSize : entries[0].contentRect.height

    if (props.duration <= 0) {
      if (Math.abs(currentHeight - newHeight) >= 1) {
        currentHeight = newHeight
        if (wrapperEl.style.height !== 'auto') {
          wrapperEl.style.height = 'auto'
        }
        emitEnd()
      }
      return;
    }

    if (Math.abs(currentHeight - newHeight) >= 1) {
      currentHeight = newHeight
      setHeight(newHeight)
    }
  })

  resizeObserver.observe(contentEl)

  const handleTransitionEnd = (e: TransitionEvent) => {
    if (e.target === wrapperEl && e.propertyName === 'height') {
      emitEnd()
    }
  }

  wrapperEl.addEventListener('transitionend', handleTransitionEnd)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  cancelAnimationFrame(animationFrame)
})
</script>

<template>
  <div ref="wrapper">
    <div ref="content">
      <slot></slot>
    </div>
  </div>
</template>
