<script setup lang="ts">
import { getLanguage } from '@/util/getLanguage'
import * as monaco from 'monaco-editor'
import '@/monacoSetup.ts'
import { NSkeleton } from 'naive-ui'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  path: string
  original: string
  modified: string
}>()

const container = ref<HTMLDivElement>()
const editorHeight = ref<string>('0px')
const isLoading = ref(true)

let editor: monaco.editor.IStandaloneDiffEditor | undefined
let viewModel: monaco.editor.IDiffEditorViewModel | undefined
let models: monaco.editor.IDiffEditorModel | undefined

onMounted(() => {
  const language = getLanguage(props.path)
  models = {
    original: monaco.editor.createModel(props.original, language),
    modified: monaco.editor.createModel(props.modified, language),
  }
  editor = monaco.editor.createDiffEditor(container.value!, {
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
    hideUnchangedRegions: {
      enabled: true,
      contextLineCount: 5,
      revealLineCount: 20,
      minimumLineCount: 3,
    },
  })
  viewModel = editor.createViewModel(models)
  editor.setModel(viewModel)

  const origEditor = editor.getOriginalEditor()
  const modEditor = editor.getModifiedEditor()
  const updateHeight = () => editorHeight.value = `${Math.max(
    origEditor.getContentHeight(),
    modEditor.getContentHeight(),
  )}px`
  editor.onDidUpdateDiff(() => {
    requestAnimationFrame(() => {
      updateHeight()
      if (isLoading.value) {
        origEditor.onDidContentSizeChange(updateHeight)
        modEditor.onDidContentSizeChange(updateHeight)
        isLoading.value = false
      }
    })
  })
})

onBeforeUnmount(() => {
  editor?.setModel(null)
  viewModel?.dispose()
  try {
    editor?.dispose()
  } catch {}
  models?.original.dispose()
  models?.modified.dispose()
})
</script>

<template>
  <div v-if="isLoading" style="padding: 20px;">
    <NSkeleton text :repeat="2" /> <NSkeleton text style="width: 60%" />
  </div>
  <div
    ref="container"
    class="text-diff"
    :style="{
      height: editorHeight,
      ...isLoading && {
        position: 'absolute',
        pointerEvents: 'none',
        visibility: 'hidden'
      }
    }"
  ></div>
</template>

<style scoped>

.text-diff {
  width: 100%;
}

</style>
