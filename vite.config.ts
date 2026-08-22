import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import circleDependency from 'vite-plugin-circular-dependency'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  base: '/version-diff-v5-preview/',
  plugins: [vue(), vueJsx(), circleDependency()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    }
  }
})
