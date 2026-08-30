export const TAG_PATH = /(?:^|\/)data\/[^\/]+\/tags\/.+\.json$/

export interface TagEntry {
  id: string
  tag: boolean
  required: boolean
}

export interface Tag {
  replace?: boolean
  values: TagEntry[]
}

export function parseTag(text: string): Tag {
  const json = JSON.parse(text)
  const values: TagEntry[] = []

  if (Array.isArray(json?.values)) {
    for (const value of json.values) {
      const object = typeof value === 'object' && value !== null
      const id = object ? value.id : value
      if (typeof id !== 'string') continue
      values.push({
        id: id.startsWith('#') ? id.slice(1) : id,
        tag: id.startsWith('#'),
        required: object ? value.required !== false : true,
      })
    }
  }

  return { replace: typeof json?.replace === 'boolean' ? json.replace : undefined, values }
}

export function tagEntryKey(entry: TagEntry) {
  return `${entry.tag ? '#' : ''}${entry.id}${entry.required ? '' : '?'}`
}

export function tagsEquivalent(a: Tag, b: Tag) {
  if (!!a.replace !== !!b.replace || a.values.length !== b.values.length) return false
  const keysA = a.values.map(tagEntryKey).sort()
  const keysB = b.values.map(tagEntryKey).sort()
  return keysA.every((key, i) => key === keysB[i])
}
