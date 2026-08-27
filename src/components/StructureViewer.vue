<script setup lang="tsx">
import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import { StructureViewerEmbed, type CompareResult, type CompareView, type CompareViewArgs } from '@/util/structureViewer'
import { deltaVirtualHandler } from '@/util/virtualHandler'
import { NSpin } from 'naive-ui'
import { onMounted, onBeforeUnmount, ref, watch, Transition } from 'vue'

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
const iframeRef = ref<HTMLIFrameElement>()
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

onMounted(async () => {
  if (!iframeRef.value) return;

  embed = new StructureViewerEmbed(iframeRef.value)

  if (props.version) {
    const version = props.dr[props.version]
    const path = props.track[props.version]!

    embed.registerHandler('custom', deltaVirtualHandler(props.dr, version))
    await embed.ready()

    await embed.send('loadPacks', {
      packs: [{ handler: 'custom', name: version }]
    })

    await embed.send('loadStructure', {
      data: await props.dr.getEntry(version, path),
      name: fileName(path),
    })
  } else {
    embed.registerHandler('a', deltaVirtualHandler(props.dr, props.dr.a))
    embed.registerHandler('b', deltaVirtualHandler(props.dr, props.dr.b))
    await embed.ready()

    await embed.send('loadPacks', { packs: [{ handler: 'a', name: props.dr.a }] })
    await embed.send('loadComparePacks', { packs: [{ handler: 'b', name: props.dr.b }] })

    const [ left, right ] = await Promise.all([
      props.dr.getEntry(props.dr.a, props.track.a),
      props.dr.getEntry(props.dr.b, props.track.b),
    ])

    const comparison = await embed.send('compare', {
      left: { data: left, name: fileName(props.track.a) },
      right: { data: right, name: fileName(props.track.b) },
      labels: [props.dr.a, props.dr.b],
      ...compareView(),
    })
    emit('counts', comparison.counts)
  }

  doneLoading.value = true
})

onBeforeUnmount(() => embed?.destroy())
</script>

<template>
  <div class="iframe-container" :style="{
    height: '80vh',
    minHeight: '500px',
  }">
    <iframe
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
