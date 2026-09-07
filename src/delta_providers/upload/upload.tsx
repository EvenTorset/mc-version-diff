import { defineAsyncComponent } from 'vue'
import { getDeltaProvider, registerDeltaProvider } from '../registry.ts'
import { resolveStaticOrSync } from '@/util/resolveToStatic.ts'
import { readUserFile } from '@/util/userFiles.ts'
import { selectedComparator } from './selectedComparator.ts'
import UploadOverview from './UploadOverview.vue'
import { readFilesMeta, UPLOAD_VERSION_A_KEY, UPLOAD_VERSION_B_KEY, type FilesMeta } from './filesMeta.ts'
import type { UploadSource } from '../index.ts'

type Slot = 'a' | 'b'

function slots(swap: string): [Slot, Slot] {
  return swap === 'swap' ? ['b', 'a'] : ['a', 'b']
}

function slotVersion(meta: FilesMeta | null, slot: Slot) {
  return slot === 'a' ? meta?.aVersion : undefined
}

function sideName(meta: FilesMeta | null, slot: Slot) {
  const name = slot === 'a' ? meta?.aName : meta?.bName
  return slotVersion(meta, slot) || name || (slot === 'a' ? 'Version A' : 'Version B')
}

async function sideSource(meta: FilesMeta | null, slot: Slot): Promise<UploadSource> {
  const version = slotVersion(meta, slot)
  if (version) return { version }
  const file = await readUserFile(slot === 'a' ? UPLOAD_VERSION_A_KEY : UPLOAD_VERSION_B_KEY)
  if (!file) throw new Error('Both sides need a file or a version to compare')
  return { name: sideName(meta, slot), content: new Uint8Array(await file.arrayBuffer()) }
}

registerDeltaProvider('upload', {
  name: 'Upload',
  selector: () => defineAsyncComponent(() => import('./UploadSelector.vue')),
  overview(dr) {
    return <UploadOverview dr={dr} />
  },
  categories() {
    const provider = getDeltaProvider(selectedComparator.value)
    if (!provider) return []
    return resolveStaticOrSync(provider.categories)
  },
  async fetch(comparatorName, swap, progressDisplay) {
    const provider = getDeltaProvider(comparatorName)
    if (!provider?.upload) {
      throw new Error(`Invalid delta provider name: '${comparatorName}'`)
    }
    selectedComparator.value = comparatorName

    const meta = readFilesMeta()
    const [ first, second ] = slots(swap)
    const [ sourceA, sourceB ] = await Promise.all([
      sideSource(meta, first),
      sideSource(meta, second),
    ])
    const [ contentA, contentB ] = await Promise.all([
      provider.upload.load(sourceA, progressDisplay),
      provider.upload.load(sourceB, progressDisplay),
    ])
    return { contentA, contentB }
  },
  compare(comparatorName, swap, contentA, contentB, progressDisplay) {
    const provider = getDeltaProvider(comparatorName)
    if (!provider?.upload) {
      throw new Error(`Invalid delta provider name: '${comparatorName}'`)
    }

    const meta = readFilesMeta()
    const [ first, second ] = slots(swap)
    return provider.compare(
      sideName(meta, first),
      sideName(meta, second),
      contentA,
      contentB,
      progressDisplay
    )
  },
})
