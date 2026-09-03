export interface FilesMeta {
  provider: string
  aName?: string
  bName?: string
  aSize?: number
  bSize?: number
}

export const UPLOAD_VERSION_A_KEY = '__upload_version_a'
export const UPLOAD_VERSION_B_KEY = '__upload_version_b'

const FILES_META_KEY = '__upload_files_meta'

export function readFilesMeta(): FilesMeta | null {
  const raw = localStorage.getItem(FILES_META_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function writeFilesMeta(meta: FilesMeta) {
  localStorage.setItem(FILES_META_KEY, JSON.stringify(meta))
}
