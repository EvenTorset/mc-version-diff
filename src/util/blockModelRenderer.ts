//@ts-ignore
import * as renderer from 'https://esm.sh/block-model-renderer@2'
import * as THREE from 'three'
import type { DeltaResult } from '@/delta_providers'
import { deltaVirtualHandler } from '@/util/virtualHandler'

// esm.sh serves modules only, so the library's bundled assets have to come from
// a CDN that hands back the raw file, or block entities render as nothing
renderer.configure({
  three: THREE,
  assetsUrl: 'https://cdn.jsdelivr.net/npm/block-model-renderer@2/assets.zip',
})

export const {
  createAnimator, getThree, loadModel, prepareAssets, readFile, renderItem, resolveModelData,
} = renderer

const prepared = new WeakMap<DeltaResult, Map<string, Promise<any>>>()

export function versionAssets(dr: DeltaResult, version: string): Promise<any> {
  if (!prepared.has(dr)) prepared.set(dr, new Map())
  const cache = prepared.get(dr)!
  if (!cache.has(version)) {
    cache.set(version, prepareAssets(deltaVirtualHandler(dr, version), { version, cache: true }))
  }
  return cache.get(version)!
}
