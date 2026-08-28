import { pngBytes } from '@/util/pngBytes'

export const DEFAULT_FRAMES = 9

const DIGITS = [
  [ 0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110 ],
  [ 0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111 ],
  [ 0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10001, 0b11111 ],
  [ 0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110 ],
  [ 0b00011, 0b00101, 0b01001, 0b10001, 0b11111, 0b00001, 0b00001 ],
  [ 0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110 ],
  [ 0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110 ],
  [ 0b11111, 0b10001, 0b00001, 0b00010, 0b00100, 0b00100, 0b00100 ],
  [ 0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110 ],
  [ 0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100 ],
]

const GLYPH_WIDTH = 5
const GLYPH_HEIGHT = 7
const SPACING = 1
const PADDING = 3

export interface FrameStrip {
  bytes: Uint8Array
  width: number
  height: number
  frames: number
}

const strips = new Map<number, Promise<FrameStrip>>()

export function numberedFrames(frames: number, exact: boolean) {
  if (!exact) {
    for (const [ count, strip ] of strips) {
      if (count >= frames) return strip
    }
  }
  if (!strips.has(frames)) strips.set(frames, buildStrip(frames))
  return strips.get(frames)!
}

async function buildStrip(frames: number): Promise<FrameStrip> {
  const digits = String(frames).length
  const widest = digits * (GLYPH_WIDTH + SPACING) - SPACING
  // the glyphs are an odd number of pixels wide and tall, so the frame has to be too to centre them
  const size = Math.max(15, widest + PADDING * 2)

  const strip = document.createElement('canvas')
  strip.width = size
  strip.height = size * frames

  const context = strip.getContext('2d')!
  context.fillStyle = '#fff'
  context.fillRect(0, 0, strip.width, strip.height)
  context.fillStyle = '#000'

  for (let i = 0; i < frames; i++) {
    const number = String(i + 1)
    const left = Math.floor((size - (number.length * (GLYPH_WIDTH + SPACING) - SPACING)) / 2)
    const top = i * size + Math.floor((size - GLYPH_HEIGHT) / 2)
    for (const [ index, digit ] of [ ...number ].entries()) {
      drawDigit(context, Number(digit), left + index * (GLYPH_WIDTH + SPACING), top)
    }
  }

  return { bytes: await pngBytes(strip), width: size, height: size, frames }
}

function drawDigit(context: CanvasRenderingContext2D, digit: number, left: number, top: number) {
  const rows = DIGITS[digit]
  for (let y = 0; y < GLYPH_HEIGHT; y++) {
    for (let x = 0; x < GLYPH_WIDTH; x++) {
      if (rows[y] >> (GLYPH_WIDTH - 1 - x) & 1) context.fillRect(left + x, top + y, 1, 1)
    }
  }
}
