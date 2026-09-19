import { reactive } from 'vue'
import type { Shell } from './util/moveScriptGen'

export const SETTINGS_STORAGE_KEY = 'mc-version-diff-settings'

const DEFAULT_SETTINGS = {
  eulaAccepted: import.meta.env.DEV,
  colorScheme: 'dark' as 'dark' | 'light' | 'oled-dark',
  pixelFont: false,
  formatJSON: false,
  cacheSizeMaxJava: 157286400,
  cacheSizeMaxBedrock: 419430400,
  cacheSizeMaxAssets: 419430400,
  enableCopyStatusButton: false,
  favoriteCategory: {} as Record<string, string>,
  chosenExecType: 'script' as 'command' | 'script',
  chosenShell: 'cmd' as Shell,
  volume: 1,
}

export type SettingsType = typeof DEFAULT_SETTINGS
export const Settings = reactive<SettingsType>({ ...DEFAULT_SETTINGS })

function stored(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function loadSettings() {
  const so = stored()

  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof SettingsType)[]) {
    const defaultValue = DEFAULT_SETTINGS[key]
    const rawValue = so[key] ?? defaultValue

    if (typeof defaultValue === 'boolean') {
      ;(Settings as any)[key] = Boolean(rawValue)
    } else if (typeof defaultValue === 'number') {
      const value = Number(rawValue)
      ;(Settings as any)[key] = Number.isFinite(value) ? value : defaultValue
    } else if (typeof defaultValue === 'object') {
      ;(Settings as any)[key] = rawValue && typeof rawValue === 'object' ? rawValue : defaultValue
    } else {
      ;(Settings as any)[key] = rawValue
    }
  }
}
