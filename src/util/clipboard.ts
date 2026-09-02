import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import { extname } from './path'

export async function copyToClipboard(bytes: Uint8Array<ArrayBuffer> | Blob, mimeType: string) {
  return navigator.clipboard.write([new ClipboardItem({
    [mimeType]: new Blob([bytes], { type: mimeType })
  })])
}

export type FileCopier = {
  test(track: DeltaTrack): boolean
  copy(content: Uint8Array<ArrayBuffer>): Promise<void>
}
const FILE_COPIERS: FileCopier[] = [
  { // Text
    test(track) {
      switch (extname(track.id)) {
        case '.txt':
        case '.json':
        case '.mcmeta':
        case '.glsl':
        case '.fsh':
        case '.vsh':
        case '.java':
        case '.java_':
          return true
      }
      return false
    },
    copy(content) {
      return copyToClipboard(content, 'text/plain')
    },
  },
  { // PNG
    test(track) {
      return track.id.endsWith('.png')
    },
    copy(content) {
      return copyToClipboard(content, 'image/png')
    },
  },
]

export function getCopier(track: DeltaTrack): FileCopier['copy'] | null {
  for (const copier of FILE_COPIERS) {
    if (copier.test(track)) return copier.copy
  }
  return null
}
