import type { StaticOrAsync } from '@/types'

export async function resolveStaticOrAsync<T>(v: StaticOrAsync<T>) {
  return typeof v === 'function' ? await v() : v
}
