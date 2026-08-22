<script setup lang="ts">
import { getLanguage } from '@/util/getLanguage'
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import * as monaco from 'monaco-editor'
import { onBeforeUnmount } from 'vue'

const props = defineProps<{
  text: string
  path: string
}>()

let editorInstance: monaco.editor.IStandaloneCodeEditor | undefined
function onMonacoMount(editor: monaco.editor.IStandaloneCodeEditor) {
  editorInstance = editor
  editor.layout({ height: editor.getContentHeight(), width: 0 })
}

onBeforeUnmount(() => {
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
