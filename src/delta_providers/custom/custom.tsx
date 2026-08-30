import { defineAsyncComponent } from 'vue'
import { getDeltaProvider, registerDeltaProvider } from '../registry.ts'
import { resolveStaticOrSync } from '@/util/resolveToStatic.ts'
import { readUserFile } from '@/util/userFiles.ts'
import { selectedComparator } from './selectedComparator.ts'

registerDeltaProvider('custom', {
  name: 'Custom',
  selector: () => defineAsyncComponent(() => import('./CustomSelector.vue')),
  overview(_dr) {
    return '[[ WORK IN PROGRESS ]]'
  },
  categories() {
    const provider = getDeltaProvider(selectedComparator.value)
    if (!provider) return []
    return resolveStaticOrSync(provider.categories)
  },
  async fetch(comparatorName, _b, progressDisplay) {
    const provider = getDeltaProvider(comparatorName)
    if (!provider?.custom) {
      throw new Error(`Invalid delta provider name: '${comparatorName}'`)
    }
    selectedComparator.value = comparatorName

    const [ contentA, contentB ] = await Promise.all([
      readUserFile('__custom_version_a'),
      readUserFile('__custom_version_b'),
    ])
    if (contentA === null || contentB === null) {
      throw new Error('Two files are required for a custom comparison')
    }

    return provider.custom.preprocess(
      'Version A',
      'Version B',
      new Uint8Array(await contentA.arrayBuffer()),
      new Uint8Array(await contentB.arrayBuffer()),
      progressDisplay
    )
  },
  compare(a, b, contentA, contentB, progressDisplay) {
    const provider = getDeltaProvider(selectedComparator.value)
    if (!provider?.custom) {
      throw new Error(`Invalid delta provider name: '${selectedComparator.value}'`)
    }

    return provider.compare(a, b, contentA, contentB, progressDisplay)
  },
})
 