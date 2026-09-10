import type { DeltaResult, DeltaTrack } from '.'

export const SUBPACK = /\/resourcepacks\/[^\/]+\.zip$/

const SUBPACK_ROOT = /^.*\/resourcepacks\/[^\/]+\.zip\//

const scoped = new WeakMap<DeltaResult, Map<string, DeltaResult>>()

function withRoot(dr: DeltaResult, root: string): DeltaResult {
  return {
    ...dr,
    getEntry(version, path) {
      if (!path || path.startsWith(root)) return dr.getEntry(version, path)
      return dr.getEntry(version, root + path).catch(() => dr.getEntry(version, path))
    },
    async listEntries(version, path) {
      const [ inner, outer ] = await Promise.all([
        dr.listEntries(version, root + path).catch(() => [] as string[]),
        dr.listEntries(version, path).catch(() => [] as string[]),
      ])
      return Array.from(new Set(inner.concat(outer)))
    },
  }
}

export function scopeToSubpack(dr: DeltaResult, track: DeltaTrack): DeltaResult {
  const root = SUBPACK_ROOT.exec(track.id)?.[0]
  if (!root) return dr
  let roots = scoped.get(dr)
  if (!roots) scoped.set(dr, roots = new Map())
  let found = roots.get(root)
  if (!found) roots.set(root, found = withRoot(dr, root))
  return found
}
