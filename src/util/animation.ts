import type { DeltaResult } from '@/delta_providers'

export function animationOf(mcmeta: string) {
  try {
    return JSON.parse(mcmeta).animation ?? null
  } catch {
    return null
  }
}

export async function readAnimation(dr: DeltaResult, version: string, path: string) {
  try {
    const raw = new TextDecoder().decode(await dr.getEntry(version, `${path}.mcmeta`))
    return animationOf(raw) ? raw : null
  } catch {
    return null
  }
}
