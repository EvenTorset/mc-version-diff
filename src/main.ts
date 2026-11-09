import { createApp } from 'vue'
import './style.scss'
import App from './App.vue'
import { router } from './router.ts'
import { setPopupableDefaults } from 'popupable-vue'

import '@/delta_providers'

setPopupableDefaults({
  order: 'content,image,counter,thumbnails',
  looping: true,
  fixedContentHeight: true,
})

createApp(App)
  .use(router)
  .mount('#app')
