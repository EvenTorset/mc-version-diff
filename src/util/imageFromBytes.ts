import { hdrToBitmap, isHdr } from './hdr'
import { tgaToBitmap } from './tga'

const cache = new WeakMap<Uint8Array, Promise<ImageBitmap>>()

export function imageFromBytes(input: Uint8Array<ArrayBuffer>) {
  let bitmap = cache.get(input)
  if (!bitmap) {
    bitmap = imageFromBytesOwned(input)
    cache.set(input, bitmap)
  }
  return bitmap
}

/** A decode the caller owns, safe to close or transfer. */
export async function imageFromBytesOwned(input: Uint8Array<ArrayBuffer>) {
  if (isHdr(input)) return hdrToBitmap(input)
  try {
    return await createImageBitmap(new Blob([input]), {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    })
  } catch (err) {
    try {
      return await tgaToBitmap(input)
    } catch {
      throw err
    }
  }
}
