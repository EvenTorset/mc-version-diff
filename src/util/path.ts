export function resolve(...paths: string[]): string {
  const lastAbs = Math.max(0, paths.findLastIndex(path => path.startsWith('/')))
  return decodeURIComponent(new URL(join(...paths.slice(lastAbs)), location.origin).pathname)
}

export function join(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '')
}

export function relative(from: string, to: string): string {
  const fromParts = resolve(from).split('/').filter(Boolean)
  const toParts = resolve(to).split('/').filter(Boolean)

  let i = 0
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
    i++
  }

  const up = '../'.repeat(fromParts.length - i)
  const down = toParts.slice(i).join('/')

  return up + down
}

export function isRelative(base: string, path: string): boolean {
  const resolvedBase = resolve(base)
  const resolvedPath = resolve(path)
  return resolvedBase === '/' || resolvedPath.startsWith(resolvedBase + '/')
}

export function dirname(path: string): string {
  const parts = resolve(path).split('/')
  parts.pop()
  return parts.join('/')
}

export function basename(path: string): string {
  const parts = resolve(path).split('/')
  return parts.length > 0 ? parts[parts.length - 1] : ''
}

export function extname(path: string): string {
  return path.match(/(?<=.)\.[^\.]+$/)?.[0] ?? ''
}
