import { createApp } from 'vue'
import './style.scss'
import App from './App.vue'
import { router } from './router.ts'
import * as monaco from 'monaco-editor'
import { loader } from '@guolao/vue-monaco-editor'
import 'easy-tooltips/styles.css'
import 'easy-tooltips'
import 'popupable/styles.css'
import 'popupable'

import JSONWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

import { getCSSVar } from '@/util/getCSSVar.ts'
import '@/delta_providers'
import '@/glsl_lang'

Object.defineProperty(globalThis, 'MonacoEnvironment', {
  configurable: true,
  value: {
    getWorker(_: any, label: string) {
      switch (label) {
        case 'json':
          return new JSONWorker()
        default:
          return new EditorWorker()
      }
    }
  }
})

monaco.editor.defineTheme('custom-theme', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': getCSSVar('--color-0-alt'),
    'editorLineNumber.activeForeground': getCSSVar('--color-6'),
    'editorLineNumber.foreground': getCSSVar('--color-4'),
    'editorWidget.foreground': getCSSVar('--color-5'),
    'editorWidget.background': getCSSVar('--color-1'),
    'editorWidget.border': getCSSVar('--color-2'),
    'input.background': getCSSVar('--color-2'),
    'foreground': getCSSVar('--color-6'),
    'descriptionForeground': getCSSVar('--color-5'),
    'textLink.foreground': getCSSVar('--color-accent'),
    'textLink.activeForeground': getCSSVar('--color-7'),
  }
})

loader.config({ monaco })

createApp(App)
  .use(router)
  .mount('#app')
