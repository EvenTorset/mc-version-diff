import { reactive } from 'vue'

export const SETTINGS_STORAGE_KEY = 'mc-version-diff-settings'

export type SettingsType = {
  lightMode: boolean
  pixelFont: boolean
  formatJSON: boolean
  cacheSizeMax: number
  enableCopyStatusButton: boolean
}

export const Settings = reactive<SettingsType>({
  lightMode: false,
  pixelFont: false,
  formatJSON: false,
  cacheSizeMax: 157286400,
  enableCopyStatusButton: false,
})

export function loadSettings() {
  const so = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')
  Settings.lightMode = !!(so?.lightMode ?? Settings.lightMode)
  Settings.pixelFont = !!(so?.pixelFont ?? Settings.pixelFont)
  Settings.formatJSON = !!(so?.formatJSON ?? Settings.formatJSON)
  Settings.cacheSizeMax = Number((so?.cacheSizeMax ?? Settings.cacheSizeMax))
  Settings.enableCopyStatusButton = !!(so?.enableCopyStatusButton ?? Settings.enableCopyStatusButton)
}
