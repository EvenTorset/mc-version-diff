import { expandSingleLanguage } from '@/delta_providers/category'
import { registerDeltaProvider } from '@/delta_providers/registry'
import { editionProvider, REHASH_OPTION } from '@/delta_providers/versions'
import { findVersion } from '@/delta_providers/manifest'
import { SOUNDS_PATH } from '@/viewers/mcje/sounds'
import { javaEdition } from './edition'

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
  categories: [
    {
      name: 'Textures',
      sort: 0,
      expand: true,
      isImages: true,
      test(_dr, track) {
        return track.id.endsWith('.png')
      }
    },
    {
      name: 'MCMETA',
      sort: 1,
      test(_dr, track) {
        return track.id.endsWith('.mcmeta')
      }
    },
    {
      name: 'Models',
      sort: 2,
      test(_dr, track) {
        return /assets\/[^\/]+\/models\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Block states',
      sort: 3,
      test(_dr, track) {
        return /assets\/[^\/]+\/blockstates\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Items',
      sort: 4,
      test(_dr, track) {
        return /assets\/[^\/]+\/items\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Localization',
      sort: 5,
      expand: expandSingleLanguage,
      test(_dr, track) {
        return /assets\/[^\/]+\/lang\/.+\.(json|lang)$/.test(track.id) || /^lang\/.+\.lang$/.test(track.id)
      }
    },
    {
      name: 'Sound definitions',
      sort: 6,
      expand: true,
      test(_dr, track) {
        return SOUNDS_PATH.test(track.id)
      }
    },
    {
      name: 'Shaders',
      sort: 7,
      test(_dr, track) {
        return /assets\/[^\/]+\/(?:shaders|post_effect)\/.+\.(?:glsl|fsh|vsh|json)$/.test(track.id)
      }
    },
    {
      name: 'Particles',
      sort: 8,
      test(_dr, track) {
        return /assets\/[^\/]+\/particles\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Advancements',
      sort: 9,
      test(_dr, track) {
        return /(assets|data)\/[^\/]+\/advancements?\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Loot tables',
      sort: 10,
      test(_dr, track) {
        return /(assets|data)\/[^\/]+\/loot_tables?\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Recipes',
      sort: 11,
      test(_dr, track) {
        return /(assets|data)\/[^\/]+\/recipes?\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Tags',
      sort: 12,
      test(_dr, track) {
        return /data\/[^\/]+\/tags\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Structures',
      sort: 13,
      test(_dr, track) {
        return /(assets|data)\/[^\/]+\/structures?\/.+\.nbt$/.test(track.id)
      }
    },
    {
      name: 'World generation',
      sort: 14,
      test(_dr, track) {
        return /data\/.+\/worldgen\/.+\.json$/.test(track.id)
      }
    },
  ],
}))
