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

export function matchRanges(path: string, search: string | RegExp | null): [number, number][] {
  if (!search) return []
  const ranges: [number, number][] = []
  if (typeof search === 'string') {
    const haystack = path.toLowerCase()
    const needle = search.toLowerCase()
    if (!needle) return ranges
    for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) {
      ranges.push([i, i + needle.length])
    }
  } else {
    const re = new RegExp(search.source, search.flags.includes('g') ? search.flags : search.flags + 'g')
    for (let match = re.exec(path); match; match = re.exec(path)) {
      if (!match[0]) {
        re.lastIndex++
        continue
      }
      ranges.push([match.index, match.index + match[0].length])
    }
  }
  return ranges
}
