export async function tgaToBitmap(
  buffer: Uint8Array<ArrayBuffer>
): Promise<ImageBitmap> {
  if (buffer.length < 18) {
    throw new Error('Invalid TGA header size')
  }

  const idLength = buffer[0]
  const colorMapType = buffer[1]
  const imageType = buffer[2]

  const firstIndex = buffer[3] | (buffer[4] << 8)
  const colorMapLength = buffer[5] | (buffer[6] << 8)
  const colorMapDepth = buffer[7]

  const width = buffer[12] | (buffer[13] << 8)
  const height = buffer[14] | (buffer[15] << 8)
  const pixelDepth = buffer[16]
  const descriptor = buffer[17]

  if (width <= 0 || height <= 0) {
    throw new Error('Invalid TGA image dimensions')
  }

  const topToBottom = (descriptor & 0x20) !== 0
  const rightToLeft = (descriptor & 0x10) !== 0

  const paletteOffset = 18 + idLength
  const paletteEntryBytes = Math.ceil(colorMapDepth / 8)

  let offset = paletteOffset

  if (colorMapType === 1) {
    offset += colorMapLength * paletteEntryBytes
  }

  const isColorMapped = imageType === 1 || imageType === 9
  const isTrueColor = imageType === 2 || imageType === 10
  const isGrayscale = imageType === 3 || imageType === 11

  if (!isColorMapped && !isTrueColor && !isGrayscale) {
    throw new Error(`Unsupported TGA image type: ${imageType}`)
  }

  if (isColorMapped && colorMapType !== 1) {
    throw new Error('Color-mapped image missing palette')
  }

  const isRLE = imageType === 9 || imageType === 10 || imageType === 11
  const bytesPerPixel = Math.ceil(pixelDepth / 8)
  const totalPixels = width * height
  const rgbaData = new Uint8ClampedArray(totalPixels * 4)
  const pixelBuffer = new Uint8ClampedArray(4)

  function decodeColor(
    colorOffset: number,
    depth: number,
    out: Uint8ClampedArray
  ): void {
    let r = 0, g = 0, b = 0, a = 255

    if (depth === 32) {
      b = buffer[colorOffset]
      g = buffer[colorOffset + 1]
      r = buffer[colorOffset + 2]
      a = buffer[colorOffset + 3]
    } else if (depth === 24) {
      b = buffer[colorOffset]
      g = buffer[colorOffset + 1]
      r = buffer[colorOffset + 2]
    } else if (depth === 16 || depth === 15) {
      const val = buffer[colorOffset] | (buffer[colorOffset + 1] << 8)
      r = (val >> 10) & 0x1f
      g = (val >> 5) & 0x1f
      b = val & 0x1f
      r = (r << 3) | (r >> 2)
      g = (g << 3) | (g >> 2)
      b = (b << 3) | (b >> 2)
      if (depth === 16 && (descriptor & 0x0f)) {
        a = val & 0x8000 ? 255 : 0
      }
    } else if (depth === 8) {
      r = g = b = buffer[colorOffset]
    }

    out[0] = r
    out[1] = g
    out[2] = b
    out[3] = a
  }

  function decodePixel(srcOffset: number, out: Uint8ClampedArray): void {
    if (isColorMapped) {
      let index = 0
      for (let i = 0; i < bytesPerPixel; i++) {
        index |= buffer[srcOffset + i] << (i * 8)
      }
      const paletteIdx = index - firstIndex
      if (paletteIdx >= 0 && paletteIdx < colorMapLength) {
        const entryOffset = paletteOffset + paletteIdx * paletteEntryBytes
        decodeColor(entryOffset, colorMapDepth, out)
      } else {
        out[0] = 0
        out[1] = 0
        out[2] = 0
        out[3] = 0
      }
    } else if (isGrayscale) {
      const val = buffer[srcOffset]
      out[0] = val
      out[1] = val
      out[2] = val
      out[3] = 255
    } else {
      decodeColor(srcOffset, pixelDepth, out)
    }
  }

  function writePixel(index: number, pixel: Uint8ClampedArray): void {
    const x = index % width
    const y = Math.floor(index / width)

    const targetX = rightToLeft ? width - 1 - x : x
    const targetY = topToBottom ? y : height - 1 - y

    const targetIndex = (targetY * width + targetX) * 4
    rgbaData[targetIndex] = pixel[0]
    rgbaData[targetIndex + 1] = pixel[1]
    rgbaData[targetIndex + 2] = pixel[2]
    rgbaData[targetIndex + 3] = pixel[3]
  }

  let pixelIdx = 0

  if (isRLE) {
    while (pixelIdx < totalPixels && offset < buffer.length) {
      const header = buffer[offset++]
      const count = (header & 0x7f) + 1
      const isRLEPacket = (header & 0x80) !== 0

      if (isRLEPacket) {
        decodePixel(offset, pixelBuffer)
        offset += bytesPerPixel
        for (let i = 0; i < count && pixelIdx < totalPixels; i++) {
          writePixel(pixelIdx++, pixelBuffer)
        }
      } else {
        for (let i = 0; i < count && pixelIdx < totalPixels; i++) {
          decodePixel(offset, pixelBuffer)
          offset += bytesPerPixel
          writePixel(pixelIdx++, pixelBuffer)
        }
      }
    }
  } else {
    while (pixelIdx < totalPixels && offset < buffer.length) {
      decodePixel(offset, pixelBuffer)
      offset += bytesPerPixel
      writePixel(pixelIdx++, pixelBuffer)
    }
  }

  const imageData = new ImageData(rgbaData, width, height)
  return createImageBitmap(imageData, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })
}
