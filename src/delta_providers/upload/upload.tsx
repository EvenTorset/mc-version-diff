import { defineAsyncComponent } from 'vue'
import { getDeltaProvider, registerDeltaProvider } from '../registry.ts'
import { resolveStaticOrSync } from '@/util/resolveToStatic.ts'
import { readUserFile } from '@/util/userFiles.ts'
import { selectedComparator } from './selectedComparator.ts'
import UploadOverview from './UploadOverview.vue'
import { readFilesMeta, UPLOAD_VERSION_A_KEY, UPLOAD_VERSION_B_KEY } from './filesMeta.ts'

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

    const [ contentA, contentB ] = await Promise.all([
      readUserFile(UPLOAD_VERSION_A_KEY),
      readUserFile(UPLOAD_VERSION_B_KEY),
    ])
    if (contentA === null || contentB === null) {
      throw new Error('Two files are required for a comparison')
    }

    const meta = readFilesMeta()
    const [ aName, bName, fileA, fileB ] = swap === 'swap'
      ? [meta?.bName, meta?.aName, contentB, contentA]
      : [meta?.aName, meta?.bName, contentA, contentB]
    return provider.upload.preprocess(
      aName ?? 'Version A',
      bName ?? 'Version B',
      new Uint8Array(await fileA.arrayBuffer()),
      new Uint8Array(await fileB.arrayBuffer()),
      progressDisplay
    )
  },
  compare(comparatorName, swap, contentA, contentB, progressDisplay) {
    const provider = getDeltaProvider(comparatorName)
    if (!provider?.upload) {
      throw new Error(`Invalid delta provider name: '${comparatorName}'`)
    }

    const meta = readFilesMeta()
    const [ aName, bName ] = swap === 'swap' // content is already swapped when fetching
      ? [ meta?.bName, meta?.aName ]
      : [ meta?.aName, meta?.bName ]
    return provider.compare(
      aName ?? 'Version A',
      bName ?? 'Version B',
      contentA,
      contentB,
      progressDisplay
    )
  },
})
