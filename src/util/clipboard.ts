export async function copyToClipboard(bytes: Uint8Array<ArrayBuffer> | Blob, mimeType: string) {
  return navigator.clipboard.write([new ClipboardItem({
    [mimeType]: new Blob([bytes], { type: mimeType })
  })])
}
