export const DEFAULT_TITLE = 'Version Diff - Asset Comparison for Minecraft'

const names = new Map<string, [ string, string ]>()

function title(a: string, b: string) {
  return `Minecraft ${a} vs ${b} | Version Diff`
}

export function rememberDelta(path: string, a: string, b: string) {
  names.set(path, [ a, b ])
  document.title = title(a, b)
}

export function deltaTitle(path: string, provider: string, a: string, b: string) {
  const known = names.get(path)
  if (known) return title(known[0], known[1])
  return provider === 'upload' ? 'Upload comparison | Version Diff' : title(a, b)
}
