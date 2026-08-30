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
export function imageFromBytesOwned(input: Uint8Array<ArrayBuffer>) {
  return createImageBitmap(new Blob([input]), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })
}
