import type { DeltaProvider } from '.'

const DELTA_PROVIDERS: Map<string, DeltaProvider<any>> = new Map()

export function registerDeltaProvider<T>(name: string, provider: DeltaProvider<T>) {
  DELTA_PROVIDERS.set(name, provider)
}

export function getDeltaProvider<T>(name: string): DeltaProvider<T> | null {
  return DELTA_PROVIDERS.get(name) ?? null
}

export function *listDeltaProviders() {
  for (const [ id, provider ] of DELTA_PROVIDERS) {
    yield { id, provider }
  }
}
