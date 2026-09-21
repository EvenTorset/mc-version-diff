import type { DeltaResult } from '@/delta_providers'

const decoder = new TextDecoder()

function stripComments(text: string) {
  let out = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j + 1
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 2
    } else {
      out += c
      i++
    }
  }
  return out
}

export function parseJson(bytes: Uint8Array) {
  const text = decoder.decode(bytes).replace(/^﻿/, '')
  try {
    return JSON.parse(text)
  } catch {
    return JSON.parse(stripComments(text))
  }
}

export async function listFiles(dr: DeltaResult, version: string, dir: string): Promise<string[]> {
  const names = await dr.listEntries(version, dir).catch(() => [])
  const out: string[] = []
  for (const name of names) {
    const path = `${dir}/${name}`
    if (/\.[^/]+$/.test(name)) out.push(path)
    else out.push(...await listFiles(dr, version, path))
  }
  return out
}
