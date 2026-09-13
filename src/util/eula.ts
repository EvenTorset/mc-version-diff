import { ref } from 'vue'

export const EULA_STORAGE_KEY = 'mc-version-diff-eula-accepted'

export const DISCLAIMER = 'NOT AN OFFICIAL MINECRAFT WEBSITE. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT'

export const EULA_URL = 'https://www.minecraft.net/en-us/eula'

function stored(): boolean {
  try {
    return localStorage.getItem(EULA_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export const eulaAccepted = ref(stored())

export function acceptEula() {
  eulaAccepted.value = true
  try {
    localStorage.setItem(EULA_STORAGE_KEY, 'true')
  } catch {}
}
