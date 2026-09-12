import MinecraftAssets from 'minecraft-asset-loader'
import { Settings } from '@/settings'
import { clearDirectory } from '@/util/opfs'
import { reactive } from 'vue'

export const CORS = 'https://cors.dokucraft.co.uk:2096/'

const PROXIED = ['https://github.com/', 'https://resources.download.minecraft.net/']

const MANIFEST_TTL = 10 * 60 * 1000

export type Edition = 'java' | 'bedrock' | 'assets'

type Instance = {
  assets: MinecraftAssets
  cacheSize: number
}

const instances = new Map<Edition, Instance>()

const progress = reactive<Record<Edition, number | null>>({ java: null, bedrock: null, assets: null })

export function manifestProgress(assets: MinecraftAssets): number | null {
  for (const [ type, instance ] of instances) {
    if (instance.assets === assets) return progress[type]
  }
  return null
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
    instance = {
      assets: new MinecraftAssets({
        type,
        cacheSize: cacheSize || null,
        cacheKey: type === 'java' ? undefined : type,
        proxy: url => PROXIED.some(host => url.startsWith(host)) ? CORS + url : false,
        manifestExpiry: MANIFEST_TTL,
        onManifestProgress: ratio => progress[type] = ratio < 1 ? ratio : null,
      }),
      cacheSize,
    }
    instances.set(type, instance)
  }
  return instance.assets
}

export function refreshManifest(assets: MinecraftAssets) {
  return assets.manifest.update()
}

for (const dir of ['download_cache', 'meta']) clearDirectory(dir)
