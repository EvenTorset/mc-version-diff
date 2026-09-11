import type * as ThreeNS from 'three'

interface Entry {
  box: ThreeNS.Box3
  refCount: number
}

const registry = new Map<string, Entry>()

export function acquireFixedFrame(THREE: typeof ThreeNS, key: string, box: ThreeNS.Box3): ThreeNS.Box3 {
  let entry = registry.get(key)
  if (!entry) {
    entry = { box: new THREE.Box3(), refCount: 0 }
    registry.set(key, entry)
  }
  entry.box.union(box)
  entry.refCount++
  return entry.box
}

export function releaseFixedFrame(key: string) {
  const entry = registry.get(key)
  if (!entry) return;
  entry.refCount--
  if (entry.refCount <= 0) registry.delete(key)
}
