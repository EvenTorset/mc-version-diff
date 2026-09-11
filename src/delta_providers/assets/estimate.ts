import { shallowRef } from 'vue'
import { assets } from '../loader'

const RELEASE = /^\d+(?:\.\d+)+$/
const TARGETED = /^(\d+(?:\.\d+)+)-(?:snapshot|pre|rc)/
const WEEKLY = /^\d\dw\d\d[a-z]$/

export type GameVersion = {
  text: string
  exact: boolean
}

const targets = shallowRef<Record<string, string> | null>(null)
let loading = false

function load() {
  if (loading) return
  loading = true
  assets('java').manifest.versions().then(all => {
    const map: Record<string, string> = {}
    let next: string | null = null
    for (const version of all) {
      if (version.type === 'release' && RELEASE.test(version.id)) next = version.id
      else if (next) map[version.id] = next
    }
    targets.value = map
  }).catch(() => { loading = false })
}

export function gameVersion(id: string): GameVersion {
  if (RELEASE.test(id)) return { text: id, exact: true }
  const targeted = TARGETED.exec(id)
  if (targeted) return { text: targeted[1], exact: false }
  if (WEEKLY.test(id)) {
    const map = targets.value
    if (!map) load()
    const found = map?.[id]
    if (found) return { text: found, exact: false }
  }
  return { text: id, exact: true }
}
