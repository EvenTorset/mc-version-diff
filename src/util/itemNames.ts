import type { DeltaResult } from '@/delta_providers'
import { shallowRef } from 'vue'

const LANG = 'assets/minecraft/lang/en_us.json'

const prettyName = (id: string) => id
  .replace(/^.+?:/, '')
  .replace(/_/g, ' ')
  .replace(/(^|\s)[a-z]/g, c => c.toUpperCase())

const langs = new WeakMap<DeltaResult, Map<string, Record<string, string> | null>>()
const loaded = shallowRef(0)

function translations(dr: DeltaResult, version: string) {
  loaded.value
  let byVersion = langs.get(dr)
  if (!byVersion) langs.set(dr, byVersion = new Map())
  if (!byVersion.has(version)) {
    byVersion.set(version, null)
    dr.getEntry(version, LANG).then(buf => {
      byVersion.set(version, JSON.parse(new TextDecoder().decode(buf)))
      loaded.value++
    }).catch(() => {})
  }
  return byVersion.get(version)
}

export function itemName(dr: DeltaResult, version: string, id: string, components?: Record<string, any>) {
  const lang = translations(dr, version)
  const [ ns, path ] = id.includes(':') ? id.split(':') : [ 'minecraft', id ]
  const potion = components?.['minecraft:potion_contents']?.potion

  if (typeof potion === 'string') {
    const effect = potion.includes(':') ? potion.split(':')[1] : potion
    const named = lang?.[`item.${ns}.${path}.effect.${effect}`]
    if (named) return named
  }

  const name = lang?.[`item.${ns}.${path}`] ?? lang?.[`block.${ns}.${path}`] ?? prettyName(id)
  return typeof potion === 'string' ? `${name} of ${prettyName(potion)}` : name
}
