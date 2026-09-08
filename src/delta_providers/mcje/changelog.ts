import { CORS } from '../assets'
const ARTICLE_URL = 'https://www.minecraft.net/en-us/article/'
const STORAGE_KEY = 'mc-version-diff-changelogs'

function known(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function articleUrl(id: string) {
  if (/^\d\dw\d\d[a-z]$/.test(id)) return `${ARTICLE_URL}minecraft-snapshot-${id}`
  if (id.includes('snapshot')) return `${ARTICLE_URL}minecraft-${id.replaceAll('.', '-')}`
  if (id.includes('-pre')) {
    const [version, pre] = id.split('-pre')
    return `${ARTICLE_URL}minecraft-${version.replaceAll('.', '-')}-pre-release-${pre.replace(/^-/, '')}`
  }
  if (id.includes('-rc')) {
    const [version, rc] = id.split('-rc')
    return `${ARTICLE_URL}minecraft-${version.replaceAll('.', '-')}-release-candidate-${rc.replace(/^-/, '')}`
  }
  return `${ARTICLE_URL}minecraft-java-edition-${id.replaceAll('.', '-')}`
}

export async function getMcjeChangelogUrl(id: string): Promise<string | null> {
  const cached = known()
  if (cached[id]) return cached[id]
  const url = articleUrl(id)
  try {
    const response = await fetch(CORS + url, { method: 'HEAD' })
    if (!response.ok) return null
  } catch {
    return null
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...known(), [id]: url }))
  return url
}
