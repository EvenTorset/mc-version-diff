export type Glyph = {
  code: number
  bitmap: string
  was?: string
}

export function parseHex(text: string): Map<number, string> {
  const glyphs = new Map<number, string>()
  for (const line of text.split('\n')) {
    const split = line.indexOf(':')
    if (split < 1) continue
    const code = parseInt(line.slice(0, split), 16)
    if (Number.isNaN(code)) continue
    glyphs.set(code, line.slice(split + 1).trim())
  }
  return glyphs
}

export function diffHex(before: Map<number, string>, after: Map<number, string>): Glyph[] {
  const glyphs: Glyph[] = []
  for (const [ code, bitmap ] of after) {
    const was = before.get(code)
    if (was === undefined || was !== bitmap) glyphs.push({ code, bitmap, was })
  }
  for (const [ code, bitmap ] of before) {
    if (!after.has(code)) glyphs.push({ code, bitmap: '', was: bitmap })
  }
  return glyphs.sort((a, b) => a.code - b.code)
}

export function listHex(glyphs: Map<number, string>): Glyph[] {
  return Array.from(glyphs, ([ code, bitmap ]) => ({ code, bitmap })).sort((a, b) => a.code - b.code)
}

export function codePoint(code: number): string {
  return 'U+' + code.toString(16).toUpperCase().padStart(4, '0')
}

export function glyphWidth(bitmap: string): number {
  return bitmap.length / 4
}

export const GLYPH_SCALE = 2

const urls = new Map<string, string>()
let canvas: HTMLCanvasElement | null = null

export function glyphUrl(bitmap: string): string {
  const cached = urls.get(bitmap)
  if (cached) return cached
  const perRow = bitmap.length / 16
  const width = perRow * 4
  const w = width * GLYPH_SCALE
  const h = 16 * GLYPH_SCALE
  canvas ??= document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(w, h)
  for (let y = 0; y < 16; y++) {
    const row = parseInt(bitmap.slice(y * perRow, (y + 1) * perRow), 16)
    if (Number.isNaN(row)) continue
    for (let x = 0; x < width; x++) {
      if (!((row >> (width - 1 - x)) & 1)) continue
      for (let dy = 0; dy < GLYPH_SCALE; dy++) {
        for (let dx = 0; dx < GLYPH_SCALE; dx++) {
          image.data[(((y * GLYPH_SCALE + dy) * w) + x * GLYPH_SCALE + dx) * 4 + 3] = 255
        }
      }
    }
  }
  ctx.putImageData(image, 0, 0)
  const url = canvas.toDataURL()
  urls.set(bitmap, url)
  return url
}
