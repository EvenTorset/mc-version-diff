import * as monaco from 'monaco-editor'

import JSONWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

import { getCSSVar } from '@/util/getCSSVar'
import '@/monaco/glsl_lang'
import { hasMonacoLoaded } from './monacoLoad'
import { Settings } from '@/settings'

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

export function updateMonacoTheme() {
  monaco.editor.defineTheme('custom-theme', {
    base: Settings.colorScheme === 'light' ? 'vs' : 'vs-dark',
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
}
updateMonacoTheme()

hasMonacoLoaded.value = true
