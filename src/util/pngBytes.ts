export function pngBytes(canvas: HTMLCanvasElement) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(async blob => {
      if (!blob) return reject(new Error('failed to encode the canvas'))
      resolve(new Uint8Array(await blob.arrayBuffer()))
    })
  })
}

export function bitmapToPng(bitmap: ImageBitmap) {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  return pngBytes(canvas)
}
