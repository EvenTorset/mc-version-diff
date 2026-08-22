import type { DeltaProvider } from '.'

const DELTA_PROVIDERS: Map<string, DeltaProvider> = new Map()

export function registerDeltaProvider(name: string, provider: DeltaProvider) {
  DELTA_PROVIDERS.set(name, provider)
}

export function getDeltaProvider(name: string): DeltaProvider | null {
  return DELTA_PROVIDERS.get(name) ?? null
}

export function *listDeltaProviders() {
  for (const [ id, provider ] of DELTA_PROVIDERS) {
    yield { id, provider }
  }
}
