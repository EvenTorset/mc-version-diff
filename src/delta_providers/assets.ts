import MinecraftAssets from 'minecraft-asset-loader'
import { Settings } from '@/settings'
import { clearDirectory } from '@/util/opfs'

export const CORS = 'https://cors.dokucraft.co.uk:2096/'

type Edition = 'java' | 'bedrock'

const instances = new Map<Edition, { assets: MinecraftAssets, cacheSize: number }>()

export function assets(type: Edition = 'java'): MinecraftAssets {
  const current = instances.get(type)
  if (current && current.cacheSize === Settings.cacheSizeMax) return current.assets
  const created = new MinecraftAssets({
    type,
    cacheSize: Settings.cacheSizeMax || null,
    proxy: url => url.startsWith('https://github.com/') ? CORS + url : false,
  })
  instances.set(type, { assets: created, cacheSize: Settings.cacheSizeMax })
  return created
}

for (const dir of ['download_cache', 'meta']) clearDirectory(dir)
