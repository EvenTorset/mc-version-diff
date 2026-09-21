import atlasUrl from '@/assets/ascii.png'
import chars from '@/assets/ascii.json'

export const GLYPH = 8
export const LINE = 10
const SPACE_ADVANCE = 4
const MISSING_ADVANCE = 6

type Glyph = { col: number, row: number, width: number }

export class BitmapFont {
  private glyphs = new Map<string, Glyph>()
  private tinted = new Map<string, CanvasImageSource>()

  constructor(private atlas: ImageBitmap) {
    const canvas = new OffscreenCanvas(atlas.width, atlas.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(atlas, 0, 0)
    const data = ctx.getImageData(0, 0, atlas.width, atlas.height).data
    const cell = atlas.width / 16
    ;(chars as string[]).forEach((line, row) => {
      Array.from(line).forEach((char, col) => {
        let width = 0
        for (let x = cell - 1; x >= 0 && !width; x--) {
          for (let y = 0; y < cell; y++) {
            if (data[((row * cell + y) * atlas.width + col * cell + x) * 4 + 3]) {
              width = x + 1
              break
            }
          }
        }
        this.glyphs.set(char, { col, row, width })
      })
    })
  }

  advance(char: string, bold = false): number {
    if (char === ' ') return SPACE_ADVANCE + (bold ? 1 : 0)
    const glyph = this.glyphs.get(char)
    if (!glyph) return MISSING_ADVANCE
    return glyph.width + 1 + (bold ? 1 : 0)
  }

  measure(text: string, scale = 1, bold = false): number {
    let width = 0
    for (const char of text) width += this.advance(char, bold)
    return width * scale
  }

  private tint(color: [ number, number, number ]): CanvasImageSource {
    const key = color.map(v => Math.round(v * 255)).join(',')
    let source = this.tinted.get(key)
    if (source) return source
    if (key === '255,255,255') source = this.atlas
    else {
      const canvas = new OffscreenCanvas(this.atlas.width, this.atlas.height)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(this.atlas, 0, 0)
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = `rgb(${key})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(this.atlas, 0, 0)
      source = canvas
    }
    this.tinted.set(key, source)
    return source
  }

  draw(ctx: OffscreenCanvasRenderingContext2D, text: string, x: number, y: number, scale: number, color: [ number, number, number ], bold = false) {
    const source = this.tint(color)
    const cell = this.atlas.width / 16
    const size = cell * scale
    let cursor = x
    for (const char of text) {
      const glyph = this.glyphs.get(char)
      if (glyph && glyph.width) {
        ctx.drawImage(source, glyph.col * cell, glyph.row * cell, glyph.width, cell, cursor, y, glyph.width * scale, size)
        if (bold) ctx.drawImage(source, glyph.col * cell, glyph.row * cell, glyph.width, cell, cursor + scale, y, glyph.width * scale, size)
      }
      cursor += this.advance(char, bold) * scale
    }
  }
}

let pending: Promise<BitmapFont> | null = null

export function loadBedrockFont(): Promise<BitmapFont> {
  if (!pending) {
    pending = fetch(atlasUrl).then(response => response.blob()).then(blob => createImageBitmap(blob)).then(atlas => new BitmapFont(atlas))
  }
  return pending
}
