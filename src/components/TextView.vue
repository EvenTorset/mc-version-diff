<script setup lang="ts">
import { getLanguage } from '@/util/getLanguage'
import * as monaco from 'monaco-editor'
import '@/monacoSetup.ts'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  text: string
  path: string
}>()

const container = ref<HTMLDivElement>()

let editor: monaco.editor.IStandaloneCodeEditor | undefined
let model: monaco.editor.ITextModel | undefined
let observer: ResizeObserver | undefined

function fit() {
  if (!editor) return;
  editor.layout()
  editor.layout({ height: editor.getContentHeight(), width: editor.getLayoutInfo().width })
}

onMounted(() => {
  model = monaco.editor.createModel(props.text, getLanguage(props.path))
  editor = monaco.editor.create(container.value!, {
    model,
    automaticLayout: true,
    theme: 'custom-theme',
    padding: {
      top: 16,
      bottom: 16,
    },
    readOnly: true,
    fontFamily: 'Cascadia Code',
    scrollBeyondLastLine: false,
    scrollbar: {
      handleMouseWheel: false,
    },
  })
  fit()

  const node = container.value!
  observer = new ResizeObserver(([ entry ]) => {
    if (entry.contentRect.width > 0) fit()
  })
  observer.observe(node.parentElement ?? node)
})

watch(() => props.text, text => {
  if (!model || model.getValue() === text) return;
  model.setValue(text)
  fit()
})

watch(() => props.path, path => {
  if (model) monaco.editor.setModelLanguage(model, getLanguage(path))
})

onBeforeUnmount(() => {
  observer?.disconnect()
  try {
    editor?.dispose()
  } catch {}
  model?.dispose()
})
</script>

<template>
  <div ref="container" class="text-view"></div>
</template>

<style scoped>

.text-view {
  width: 100%;
}

</style>
