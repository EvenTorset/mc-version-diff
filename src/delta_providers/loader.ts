import MinecraftAssets, { type VersionManifest } from 'minecraft-asset-loader'
import { Settings } from '@/settings'
import { clearDirectory } from '@/util/opfs'
import { reactive } from 'vue'

export const CORS = 'https://cors.dokucraft.co.uk:2096/'

const PROXIED = ['https://github.com/', 'https://resources.download.minecraft.net/']

const MANIFEST_TTL = 10 * 60 * 1000
const MANIFEST_RETRY = 60 * 1000

export type Edition = 'java' | 'bedrock' | 'assets'

type Instance = {
  assets: MinecraftAssets
  cacheSize: number
  manifestTime: number
  refreshing: Promise<void> | null
}

const instances = new Map<Edition, Instance>()
const byAssets = new WeakMap<MinecraftAssets, Instance>()

const progress = reactive<Record<Edition, number | null>>({ java: null, bedrock: null, assets: null })

export function manifestProgress(assets: MinecraftAssets): number | null {
  for (const [ type, instance ] of instances) {
    if (instance.assets === assets) return progress[type]
  }
  return null
}

function storedManifest(type: Edition): { time: number, manifest: VersionManifest } | null {
  try {
    const stored = JSON.parse(localStorage.getItem(`manifest_${type}`) ?? 'null')
    if (Array.isArray(stored?.manifest?.versions) && typeof stored.time === 'number') return stored
  } catch {}
  return null
}

async function storeManifest(type: Edition, instance: Instance) {
  const versions = await instance.assets.manifest.versions()
  instance.manifestTime = Date.now()
  localStorage.setItem(`manifest_${type}`, JSON.stringify({ time: instance.manifestTime, manifest: { versions } }))
}

function refresh(type: Edition, instance: Instance, force: boolean) {
  if (instance.refreshing) return instance.refreshing
  const fetched = instance.manifestTime > 0 || force
  instance.refreshing = (fetched ? instance.assets.manifest.update() : Promise.resolve())
    .then(() => storeManifest(type, instance))
    .catch(() => { instance.manifestTime = Date.now() - MANIFEST_TTL + MANIFEST_RETRY })
    .finally(() => { instance.refreshing = null })
  return instance.refreshing
}

export function cacheSizeMax(type: Edition): number {
  return type === 'java' ? Settings.cacheSizeMaxJava : type === 'bedrock' ? Settings.cacheSizeMaxBedrock : Settings.cacheSizeMaxAssets
}

export function applyCacheSize(type: Edition): Promise<void> {
  const instance = instances.get(type)
  const cacheSize = cacheSizeMax(type)
  if (!instance || instance.cacheSize === cacheSize) return Promise.resolve()
  instance.cacheSize = cacheSize
  return instance.assets.setCacheSize(cacheSize || null)
}

export function assets(type: Edition = 'java'): MinecraftAssets {
  let instance = instances.get(type)
  const cacheSize = cacheSizeMax(type)
  applyCacheSize(type)
  if (!instance) {
    const stored = storedManifest(type)
    instance = {
      assets: new MinecraftAssets({
        type,
        cacheSize: cacheSize || null,
        cacheKey: type === 'java' ? undefined : type,
        proxy: url => PROXIED.some(host => url.startsWith(host)) ? CORS + url : false,
        manifest: stored?.manifest,
        manifestExpiry: MANIFEST_TTL,
        onManifestProgress: ratio => progress[type] = ratio < 1 ? ratio : null,
      }),
      cacheSize,
      manifestTime: stored?.time ?? 0,
      refreshing: null,
    }
    instances.set(type, instance)
    byAssets.set(instance.assets, instance)
  }
  if (Date.now() - instance.manifestTime > MANIFEST_TTL) refresh(type, instance, false)
  return instance.assets
}

export function refreshManifest(assets: MinecraftAssets) {
  for (const [ type, instance ] of instances) {
    if (instance.assets === assets) return refresh(type, instance, true)
  }
  return assets.manifest.update()
}

for (const dir of ['download_cache', 'meta']) clearDirectory(dir)
