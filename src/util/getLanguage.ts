export function getLanguage(filePath: string) {
  const ext = filePath.slice(filePath.lastIndexOf('.'))
  switch (ext) {
    case '.json':
    case '.mcmeta':
      return 'json'
    case '.glsl':
    case '.fsh':
    case '.vsh':
      return 'glsl'
    default:
      return 'plaintext'
  }
}
