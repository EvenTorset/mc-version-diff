const decoder = new TextDecoder()

export function isHdr(buffer: Uint8Array) {
  return buffer.length > 2 && buffer[0] === 0x23 && buffer[1] === 0x3f
}

export async function hdrToBitmap(buffer: Uint8Array<ArrayBuffer>): Promise<ImageBitmap> {
  let offset = 0
  const readLine = () => {
    const start = offset
    while (offset < buffer.length && buffer[offset] !== 0x0a) offset++
    return decoder.decode(buffer.subarray(start, offset++))
  }

  if (!readLine().startsWith('#?')) {
    throw new Error('Not a Radiance HDR file')
  }
  let line = readLine()
  while (line !== '') {
    if (line.startsWith('FORMAT=') && line !== 'FORMAT=32-bit_rle_rgbe') {
      throw new Error(`Unsupported HDR format: ${line.slice(7)}`)
    }
    line = readLine()
  }

  const resolution = /^([-+])Y (\d+) ([-+])X (\d+)$/.exec(readLine())
  if (!resolution) {
    throw new Error('Unsupported HDR resolution line')
  }
  const flipY = resolution[1] === '+'
  const flipX = resolution[3] === '-'
  const height = Number(resolution[2])
  const width = Number(resolution[4])

  const rgbe = new Uint8Array(width * height * 4)
  const scanline = new Uint8Array(width * 4)

  for (let y = 0; y < height; y++) {
    const rle = width >= 8 && width < 0x8000
      && buffer[offset] === 2 && buffer[offset + 1] === 2
      && ((buffer[offset + 2] << 8) | buffer[offset + 3]) === width

    if (rle) {
      offset += 4
      for (let channel = 0; channel < 4; channel++) {
        let x = 0
        while (x < width) {
          let count = buffer[offset++]
          if (count > 128) {
            count -= 128
            const value = buffer[offset++]
            for (let i = 0; i < count; i++) scanline[(x++) * 4 + channel] = value
          } else {
            for (let i = 0; i < count; i++) scanline[(x++) * 4 + channel] = buffer[offset++]
          }
        }
      }
    } else {
      scanline.set(buffer.subarray(offset, offset + width * 4))
      offset += width * 4
    }

    rgbe.set(scanline, y * width * 4)
  }

  const pixels = width * height
  const linear = new Float32Array(pixels * 3)
  const brightest = new Float32Array(pixels)
  for (let i = 0; i < pixels; i++) {
    const e = rgbe[i * 4 + 3]
    const scale = e === 0 ? 0 : 2 ** (e - 136)
    for (let c = 0; c < 3; c++) linear[i * 3 + c] = rgbe[i * 4 + c] * scale
    brightest[i] = Math.max(linear[i * 3], linear[i * 3 + 1], linear[i * 3 + 2])
  }
  brightest.sort()
  const exposure = Math.min(1, 1 / brightest[Math.floor(pixels * 0.99)])

  const rgba = new Uint8ClampedArray(pixels * 4)
  for (let i = 0; i < pixels; i++) {
    const x = i % width
    const y = Math.floor(i / width)
    const target = ((flipY ? height - 1 - y : y) * width + (flipX ? width - 1 - x : x)) * 4
    for (let c = 0; c < 3; c++) {
      const exposed = Math.min(1, linear[i * 3 + c] * exposure)
      rgba[target + c] = Math.round(exposed ** (1 / 2.2) * 255)
    }
    rgba[target + 3] = 255
  }

  return createImageBitmap(new ImageData(rgba, width, height), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })
}
