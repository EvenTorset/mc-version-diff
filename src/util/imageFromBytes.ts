export function imageFromBytes(input: Uint8Array<ArrayBuffer>) {
  return createImageBitmap(new Blob([input]), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })
}
