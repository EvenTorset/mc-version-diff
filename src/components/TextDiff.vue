<script setup lang="ts">
import { getLanguage } from '@/util/getLanguage'
import { VueMonacoDiffEditor } from '@guolao/vue-monaco-editor'
import * as monaco from 'monaco-editor'
import '@/monacoSetup.ts'
import { NSkeleton } from 'naive-ui'
import { onBeforeUnmount, ref } from 'vue'

const props = defineProps<{
  path: string
  original: string
  modified: string
}>()

const editorHeight = ref<string>('0px')
const isLoading = ref(true)

let editorInstance: monaco.editor.IStandaloneDiffEditor | undefined
function onMonacoMount(editor: monaco.editor.IStandaloneDiffEditor) {
  editorInstance = editor
  const origEditor = editor.getOriginalEditor()
  const modEditor = editor.getModifiedEditor()
  const updateHeight = () => editorHeight.value = `${Math.max(
    origEditor.getContentHeight(),
    modEditor.getContentHeight(),
  )}px`
  const onDiffUpdate = () => {
    requestAnimationFrame(() => {
      updateHeight()
      if (isLoading.value) {
        origEditor.onDidContentSizeChange(updateHeight)
        modEditor.onDidContentSizeChange(updateHeight)
        isLoading.value = false
      }
    })
  }
  editor.onDidUpdateDiff(onDiffUpdate)
}

onBeforeUnmount(() => {
  editorInstance?.dispose()
})
</script>

<template>
  <div v-if="isLoading" style="padding: 20px;">
    <NSkeleton text :repeat="2" /> <NSkeleton text style="width: 60%" />
  </div>
  <VueMonacoDiffEditor
    ref="editorComp"
    :original
    :modified
    theme="custom-theme"
    :height="editorHeight"
    :language="getLanguage(path)"
    @mount="onMonacoMount"
    :style="{
      ...isLoading && {
        position: 'absolute',
        pointerEvents: 'none',
        visibility: 'hidden'
      }
    }"
    :options="{
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
      }
    }"
  />
</template>
