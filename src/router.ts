import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { getDiffSuggestions, loadMCJEManifest } from './delta_providers/mcje/version_manifest'

const routes: RouteRecordRaw[] = [
  { name: 'home', path: '/', component: () => import('@/pages/Home.vue') },
  { name: 'settings', path: '/settings', component: () => import('@/pages/Settings.vue') },
  { name: 'delta', path: '/!/:provider/:a/:b', component: () => import('@/pages/Delta.vue') },
]

export const router = createRouter({
  history: createWebHistory('/version-diff-v5-preview'),
  routes,
})

router.beforeEach(async to => {
  if (to.path !== '/') {
    return;
  }

  const search = window.location.search.slice(1)

  switch (search) {
    case 'latest':
    case 'since-release':
    // case 'latest-release':
    case 'major-release':
    case 'patches':
      await loadMCJEManifest()
      const suggestion = getDiffSuggestions()[({
        'latest': 'latestVersion',
        'since-release': 'sinceRelease',
        // 'latest-release': 'latestRelease',
        'major-release': 'majorRelease',
        'patches': 'releasePatches',
      } as const)[search]]
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
