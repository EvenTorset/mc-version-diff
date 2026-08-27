import type { DeltaResult } from '@/delta_providers'
import type { VirtualHandler } from '@/util/structureViewer'

export type { VirtualHandler }

// the structure viewer embed and block-model-renderer both take a source of
// this shape in place of a real pack
export function deltaVirtualHandler(dr: DeltaResult, version: string): VirtualHandler {
  return {
    async read(filePath) {
      return await dr.getEntry(version, filePath).catch(() => null)
    },
    async list(dir) {
      return await dr.listEntries(version, dir).catch(() => [])
    },
  }
}
