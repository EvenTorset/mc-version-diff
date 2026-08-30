<script setup lang="ts">
import { getLanguage } from '@/util/getLanguage'
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import * as monaco from 'monaco-editor'
import '@/monacoSetup.ts'
import { onBeforeUnmount } from 'vue'

const props = defineProps<{
  text: string
  path: string
}>()

let editorInstance: monaco.editor.IStandaloneCodeEditor | undefined
let observer: ResizeObserver | undefined

function onMonacoMount(editor: monaco.editor.IStandaloneCodeEditor) {
  editorInstance = editor
  const fit = () => {
    editor.layout()
    editor.layout({ height: editor.getContentHeight(), width: editor.getLayoutInfo().width })
  }
  fit()

  const node = editor.getContainerDomNode()
  observer = new ResizeObserver(([ entry ]) => {
    if (entry.contentRect.width > 0) fit()
  })
  observer.observe(node.parentElement ?? node)
}

onBeforeUnmount(() => {
  observer?.disconnect()
  editorInstance?.dispose()
})
</script>

<template>
  <VueMonacoEditor
    :value="text"
    theme="custom-theme"
    :language="getLanguage(path)"
    @mount="onMonacoMount"
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
    }"
  />
</template>
