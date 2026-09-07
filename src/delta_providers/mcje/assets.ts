import MinecraftAssets from 'minecraft-asset-loader'
import { Settings } from '@/settings'
import { clearDirectory, getDirectory, getDirectorySize } from '@/util/opfs'

const CACHE_DIR = 'minecraft-asset-loader'

let instance: MinecraftAssets | null = null
let instanceCacheSize = 0

export function assets(): MinecraftAssets {
  if (!instance || instanceCacheSize !== Settings.cacheSizeMax) {
    instanceCacheSize = Settings.cacheSizeMax
    instance = new MinecraftAssets({ cacheSize: instanceCacheSize || null })
  }
  return instance
}

export async function clearCache(): Promise<void> {
  await assets().clearCache()
}

export async function getCacheSize(): Promise<{ size: number, count: number }> {
  return getDirectorySize(await getDirectory(CACHE_DIR))
}

for (const dir of ['download_cache', 'meta']) clearDirectory(dir)
