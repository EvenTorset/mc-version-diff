import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { getSuggestionPair, type SuggestionKey } from './delta_providers/manifest'
import { getDeltaProvider } from './delta_providers/registry'
import { javaEdition } from './delta_providers/mcje/edition'
import { URL_BASE } from '@/../urlBase'
import DeltaRoute from '@/pages/DeltaRoute.vue'
import { DEFAULT_TITLE, deltaTitle } from '@/util/documentTitle'

const SUGGESTIONS: Record<string, SuggestionKey> = {
  'featured': 'featured',
  'latest': 'latest',
  'since-release': 'since-release',
  'major': 'major',
  'major-release': 'major',
  'patches': 'patches',
}

const routes: RouteRecordRaw[] = [
  { name: 'delta', path: '/:provider/:a/:b?', component: DeltaRoute },
  { name: 'home', path: '/:provider?', component: () => import('@/pages/Home.vue') },
]

export const router = createRouter({
  history: createWebHistory(URL_BASE),
  routes,
})

router.afterEach(to => {
  document.title = to.name === 'delta'
    ? deltaTitle(to.path, to.params.provider as string, to.params.a as string, to.params.b as string)
    : DEFAULT_TITLE
  document.querySelector('link[rel="canonical"]')
    ?.setAttribute('href', `https://cccode.pages.dev/version-diff${to.path}`)
})

router.beforeEach(async to => {
  if (to.name === 'delta' && !to.params.b) {
    const provider = to.params.provider as string
    const edition = getDeltaProvider(provider)?.edition
    const key = SUGGESTIONS[to.params.a as string]
    if (!edition || !key) {
      return;
    }

    const suggestion = await getSuggestionPair(edition, key)
    if (!suggestion) {
      return { name: 'home', params: { provider }, replace: true }
    }

    return {
      name: 'delta',
      params: {
        provider,
        a: suggestion[0].id,
        b: suggestion[1].id,
      },
      query: to.query,
      hash: to.hash,
      replace: true,
    }
  }

  if (to.path !== '/') {
    return;
  }

  const search = window.location.search.slice(1)
  const key = SUGGESTIONS[search]

  if (key) {
    const suggestion = await getSuggestionPair(javaEdition, key)
    if (!suggestion) return;
    return {
      name: 'delta',
      params: {
        provider: 'mcje',
        a: suggestion[0].id,
        b: suggestion[1].id,
      },
      replace: true,
    }
  }

  if (!/^[^,]+,[^,]+$/.test(search)) {
    return;
  }

  const [ a, b ] = search.split(',')
  return {
    name: 'delta',
    params: {
      provider: 'mcje',
      a,
      b,
    },
    replace: true,
  }
})
