import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import circleDependency from 'vite-plugin-circular-dependency'
import path from 'node:path'
import { URL_BASE } from './urlBase.ts'

// https://vite.dev/config/
export default defineConfig({
  base: `${URL_BASE}/`,
  plugins: [vue(), vueJsx(), circleDependency()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    }
  }
})
