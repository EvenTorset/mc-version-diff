type Token = {
  raw: string
  num: boolean
}

const tokenCache = new Map<string, Token[]>()
let tokenCacheTimeout: ReturnType<typeof setTimeout> | null

function tokenize(s: string): Token[] {
  const cached = tokenCache.get(s)
  if (cached) return cached

  const out: Token[] = []
  const lower = s.toLowerCase()
  const len = lower.length
  let i = 0

  while (i < len) {
    const code = lower.charCodeAt(i)
    let j = i + 1, t: number
    if (code >= 48 && code <= 57) {
      while (j < len && (t = lower.charCodeAt(j)) >= 48 && t <= 57) j++
      out.push({ raw: lower.slice(i, j), num: true })
      i = j
      continue
    }

    while (j < len && !((t = lower.charCodeAt(j)) >= 48 && t <= 57)) j++
    out.push({ raw: lower.slice(i, j), num: false })
    i = j
  }

  tokenCache.set(s, out)
  return out
}

function compareNumbers(a: string, b: string): number {
  let ia = 0, ib = 0
  while (ia < a.length && a.charCodeAt(ia) === 48) ia++
  while (ib < b.length && b.charCodeAt(ib) === 48) ib++
  const lena = a.length - ia
  const lenb = b.length - ib
  if (lena !== lenb) return lena - lenb
  for (let k = 0; k < lena; k++) {
    const da = a.charCodeAt(ia + k)
    const db = b.charCodeAt(ib + k)
    if (da !== db) return da - db
  }
  return (a.length - b.length)
}

export function naturalCompare(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0 || b.length === 0) return a.length - b.length

  if (tokenCacheTimeout === null) {
    tokenCacheTimeout = setTimeout(() => {
      tokenCacheTimeout = null
      tokenCache.clear()
    }, 10_000)
  }

  const at = tokenize(a)
  const bt = tokenize(b)

  const la = at.length
  const lb = bt.length
  const minl = la < lb ? la : lb
  for (let i = 0; i < minl; i++) {
    const { raw: tar, num: tan } = at[i]
    const { raw: tbr, num: tbn } = bt[i]
    if (tar === tbr) continue

    if (tan && tbn) {
      const n = compareNumbers(tar, tbr)
      if (n !== 0) return n
      if (tar.length !== tbr.length) return tar.length < tbr.length ? -1 : 1
    }

    return tar < tbr ? -1 : 1
  }

  if (la !== lb) return la < lb ? -1 : 1
  return 0
}
