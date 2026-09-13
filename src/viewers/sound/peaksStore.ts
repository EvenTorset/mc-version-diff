const MAX_ENTRIES = 400

const store = new Map<string, Float32Array>()

export function peaksKey(version: string, name: string, size: number, buckets: number): string {
  return `${version}|${name}|${size}|${buckets}`
}

export function cachedPeaks(key: string): Float32Array | undefined {
  const peaks = store.get(key)
  if (!peaks) return undefined
  store.delete(key)
  store.set(key, peaks)
  return peaks
}

export function cachePeaks(key: string, peaks: Float32Array) {
  store.delete(key)
  store.set(key, peaks)
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value!)
}
