import { reactive } from 'vue'
import type { Shell } from './util/moveScriptGen'

export const SETTINGS_STORAGE_KEY = 'mc-version-diff-settings'

export type SettingsType = {
  lightMode: boolean
  pixelFont: boolean
  formatJSON: boolean
  cacheSizeMaxJava: number
  cacheSizeMaxBedrock: number
  cacheSizeMaxAssets: number
  enableCopyStatusButton: boolean
  favoriteCategory: Record<string, string>
  chosenExecType: 'command' | 'script'
  chosenShell: Shell
  volume: number
}

export const Settings = reactive<SettingsType>({
  lightMode: false,
  pixelFont: false,
  formatJSON: false,
  cacheSizeMaxJava: 157286400,
  cacheSizeMaxBedrock: 419430400,
  cacheSizeMaxAssets: 419430400,
  enableCopyStatusButton: false,
  favoriteCategory: {},
  chosenExecType: 'script',
  chosenShell: 'cmd',
  volume: 1,
})

export function loadSettings() {
  const so = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')
  Settings.lightMode = !!(so?.lightMode ?? Settings.lightMode)
  Settings.pixelFont = !!(so?.pixelFont ?? Settings.pixelFont)
  Settings.formatJSON = !!(so?.formatJSON ?? Settings.formatJSON)
  Settings.cacheSizeMaxJava = Number(so?.cacheSizeMaxJava ?? Settings.cacheSizeMaxJava)
  Settings.cacheSizeMaxBedrock = Number(so?.cacheSizeMaxBedrock ?? Settings.cacheSizeMaxBedrock)
  Settings.cacheSizeMaxAssets = Number(so?.cacheSizeMaxAssets ?? Settings.cacheSizeMaxAssets)
  Settings.enableCopyStatusButton = !!(so?.enableCopyStatusButton ?? Settings.enableCopyStatusButton)
  Settings.favoriteCategory = so?.favoriteCategory ?? Settings.favoriteCategory
  Settings.chosenExecType = so?.chosenExecType ?? Settings.chosenExecType
  Settings.chosenShell = so?.chosenShell ?? Settings.chosenShell
  Settings.volume = Number(so?.volume ?? Settings.volume)
}
