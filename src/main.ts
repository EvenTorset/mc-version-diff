import { createApp } from 'vue'
import './style.scss'
import App from './App.vue'
import { router } from './router.ts'
import 'easy-tooltips/styles.css'
import 'easy-tooltips'
import 'popupable/styles.css'
import 'popupable'

import '@/delta_providers'

createApp(App)
  .use(router)
  .mount('#app')
