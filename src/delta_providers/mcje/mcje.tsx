import { registerDeltaProvider } from '@/delta_providers/registry'
import { editionProvider, REHASH_OPTION } from '@/delta_providers/versions'
import { findVersion } from '@/delta_providers/manifest'
import { javaEdition } from './edition'
import { javaCategories } from './categories'

function uploadFilter(legacy: boolean) {
  return (path: string) => !path.endsWith('.class') && (
    legacy
      ? !path.startsWith('META-INF/')
      : !path.includes('/') || /(assets|data)[/]/.test(path)
  )
}

registerDeltaProvider('mcje', editionProvider(javaEdition, {
  upload: {
    accept: '.jar,.zip',
    async prepare(entries, params, against) {
      const legacy = params.get('legacy') === 'true'
        || (against !== undefined && (await findVersion(javaEdition.assets, against))?.legacyLayout === true)
      const keep = uploadFilter(legacy)
      return entries.filter(e => keep(e.path))
    },
    options: [
      REHASH_OPTION,
      {
        label: 'Legacy assets',
        queryParam: 'legacy',
        type: 'bool',
        default: false,
        uploadsOnly: true,
        tooltip: () => <>
          <h3>Legacy assets</h3>
          <p>
            Use the pre-1.6 file structure.
          </p>
        </>,
      },
    ],
  },
  categories: javaCategories,
}))
