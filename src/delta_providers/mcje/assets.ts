import MinecraftAssets from 'minecraft-asset-loader'
import { Settings } from '@/settings'
import { clearDirectory } from '@/util/opfs'

let instance: MinecraftAssets | null = null
let instanceCacheSize = 0

export function assets(): MinecraftAssets {
  if (!instance || instanceCacheSize !== Settings.cacheSizeMax) {
    instanceCacheSize = Settings.cacheSizeMax
    instance = new MinecraftAssets({ cacheSize: instanceCacheSize || null })
  }
  return instance
}

for (const dir of ['download_cache', 'meta']) clearDirectory(dir)
