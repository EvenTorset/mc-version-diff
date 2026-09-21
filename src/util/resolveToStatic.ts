import type { StaticOrAsync, StaticOrSync } from '@/types'

export function resolveStaticOrSync<T, A extends any[] = []>(
  v: StaticOrSync<T, A>,
  ...args: A
): T {
  return typeof v === 'function'
    ? (v as (...args: A) => T)(...args)
    : v as T
}

export async function resolveStaticOrAsync<T, A extends any[] = []>(
  v: StaticOrAsync<T, A>,
  ...args: A
): Promise<T> {
  return typeof v === 'function'
    ? await (v as (...args: A) => Promise<T> | T)(...args)
    : v as T
}
