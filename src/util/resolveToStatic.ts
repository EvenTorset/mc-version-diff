import type { StaticOrAsync, StaticOrSync } from '@/types'

export function resolveStaticOrSync<T>(v: StaticOrSync<T>): T {
  return typeof v === 'function' ? v() : v as T
}

export async function resolveStaticOrAsync<T>(v: StaticOrAsync<T>): Promise<T> {
  return typeof v === 'function' ? await v() : v as T
}
