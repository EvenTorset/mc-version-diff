<script setup lang="tsx">
import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import { StructureViewerEmbed } from '@/util/structureViewer'
import { NSpin } from 'naive-ui'
import { onMounted, ref, Transition } from 'vue'

const structureViewerUrl = 'https://structure-viewer.ewanhowell.com/?minimal&manual&background=transparent'

const props = defineProps<{
  dr: DeltaResult
  track: DeltaTrack
  version: 'a' | 'b'
}>()

const doneLoading = ref(false)
const iframeRef = ref<HTMLIFrameElement>()

onMounted(async () => {
  if (!iframeRef.value) return;

  const embed = new StructureViewerEmbed(iframeRef.value)
  embed.registerHandler('custom', {
    read: (path) => props.dr.getEntry(props.dr[props.version], path).catch(() => null),
    list: (path) => props.dr.listEntries(props.dr[props.version], path),
  })

  await embed.ready()

  await embed.send('loadPacks', {
    packs: [{ handler: 'custom', name: 'Custom' }]
  })

  await embed.send('loadStructure', {
    data: await props.dr.getEntry(props.dr[props.version], props.track[props.version]),
    name: props.track[props.version].slice(props.track[props.version].lastIndexOf('/') + 1),
  })

  doneLoading.value = true
})
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
