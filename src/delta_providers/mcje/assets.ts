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

export async function clearCache(): Promise<void> {
  await assets().clearCache()
}

export async function getCacheSize(): Promise<{ size: number, count: number }> {
  const stats = await assets().cacheStats()
  return { size: stats?.size ?? 0, count: stats?.files ?? 0 }
}

for (const dir of ['download_cache', 'meta']) clearDirectory(dir)
