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
  async fetch(comparatorName, _b, progressDisplay) {
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
    return provider.upload.preprocess(
      meta?.aName ?? 'Version A',
      meta?.bName ?? 'Version B',
      new Uint8Array(await contentA.arrayBuffer()),
      new Uint8Array(await contentB.arrayBuffer()),
      progressDisplay
    )
  },
  compare(_a, _b, contentA, contentB, progressDisplay) {
    const provider = getDeltaProvider(selectedComparator.value)
    if (!provider?.upload) {
      throw new Error(`Invalid delta provider name: '${selectedComparator.value}'`)
    }

    const meta = readFilesMeta()
    return provider.compare(
      meta?.aName ?? 'Version A',
      meta?.bName ?? 'Version B',
      contentA,
      contentB,
      progressDisplay
    )
  },
})
