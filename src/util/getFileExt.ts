export default function getFileExt(filePath: string): string {
  const idx = filePath.lastIndexOf('.')
  return idx !== -1 ? filePath.slice(idx).toLowerCase() : ''
}
