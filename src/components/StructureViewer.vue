<script setup lang="tsx">
import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import { StructureViewerEmbed, type CompareResult, type CompareView, type CompareViewArgs } from '@/util/structureViewer'
import { deltaVirtualHandler } from '@/util/virtualHandler'
import { NSpin } from 'naive-ui'
import { nextTick, onBeforeUnmount, ref, watch, Transition } from 'vue'
import { useIframeBudget } from '@/util/iframeBudget'

const structureViewerUrl = 'https://structure-viewer.ewanhowell.com/?minimal&manual&nosky&background=transparent'

const props = defineProps<{
  dr: DeltaResult
  track: DeltaTrack
  version?: 'a' | 'b'
  show?: CompareViewArgs['show']
  view?: CompareView
}>()

const emit = defineEmits<{
  counts: [counts: CompareResult['counts']]
}>()

const doneLoading = ref(false)
const container = ref<HTMLElement>()
const iframeRef = ref<HTMLIFrameElement>()
const active = useIframeBudget(container)
let embed: StructureViewerEmbed | undefined

function compareView(): CompareViewArgs {
  return {
    show: { added: true, changed: true, removed: true, ...props.show },
    view: props.view ?? 'slide',
  }
}

watch(() => [props.show, props.view], () => {
  embed?.send('compare', compareView()).catch(() => {})
}, { deep: true })

function fileName(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}

async function load() {
  if (!iframeRef.value) return;

  const current = embed = new StructureViewerEmbed(iframeRef.value)

  if (props.version) {
    const version = props.dr[props.version]
    const path = props.track[props.version]!

    current.registerHandler('custom', deltaVirtualHandler(props.dr, version))
    await current.ready()

    await current.send('loadPacks', {
      packs: [{ handler: 'custom', name: version }]
    })

    await current.send('loadStructure', {
      data: await props.dr.getEntry(version, path),
      name: fileName(path),
    })
  } else {
    current.registerHandler('a', deltaVirtualHandler(props.dr, props.dr.a))
    current.registerHandler('b', deltaVirtualHandler(props.dr, props.dr.b))
    await current.ready()

    await current.send('loadPacks', { packs: [{ handler: 'a', name: props.dr.a }] })
    await current.send('loadComparePacks', { packs: [{ handler: 'b', name: props.dr.b }] })

    const [ left, right ] = await Promise.all([
      props.dr.getEntry(props.dr.a, props.track.a),
      props.dr.getEntry(props.dr.b, props.track.b),
    ])

    const comparison = await current.send('compare', {
      left: { data: left, name: fileName(props.track.a) },
      right: { data: right, name: fileName(props.track.b) },
      labels: [props.dr.a, props.dr.b],
      ...compareView(),
    })
    if (embed !== current) return;
    emit('counts', comparison.counts)
  }

  if (embed === current) doneLoading.value = true
}

function unload() {
  embed?.destroy()
  embed = undefined
  doneLoading.value = false
}

watch(active, async isActive => {
  if (isActive) {
    await nextTick()
    load()
  } else {
    unload()
  }
})

onBeforeUnmount(unload)
</script>

<template>
  <div ref="container" class="iframe-container" :style="{
    height: '80vh',
    minHeight: '500px',
  }">
    <iframe
      v-if="active"
      ref="iframeRef"
      :src="structureViewerUrl"
      width="100%"
      height="100%"
      allowfullscreen
    ></iframe>
    <Transition name="fade">
      <div v-if="!doneLoading" class="loading-cover">
        <NSpin size="large" />
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  position: absolute;
  opacity: 0;
}

iframe {
  background-color: var(--background-color);
}

.iframe-container {
  position: relative;
}

.loading-cover {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--background-color);
}

</style>
