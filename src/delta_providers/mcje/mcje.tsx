import { registerDeltaProvider } from '@/delta_providers/registry'
import { editionProvider } from '@/delta_providers/versions'
import { javaEdition } from './edition'

registerDeltaProvider('mcje', editionProvider(javaEdition, {
  upload: {
    accept: '.jar,.zip',
    options: [
      {
        label: 'Rehash',
        queryParam: 'rehash',
        type: 'bool',
        default: false,
        tooltip: () => <>
          <h3>Rehash</h3>
          <p>
            Recalculates file hashes before comparing.
          </p>
          <p><strong>When to use:</strong> If stored hashes are missing or corrupted, causing incorrect comparison results.</p>
          <p><strong>Downside:</strong> Significantly increases comparison time.</p>
        </>,
      },
      {
        label: 'Legacy assets',
        queryParam: 'legacy',
        type: 'bool',
        default: false,
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
      expand: true,
      test(_dr, track) {
        return /assets\/[^\/]+\/lang\/.+\.(json|lang)$/.test(track.id) || /^lang\/.+\.lang$/.test(track.id)
      }
    },
    {
      name: 'Shaders',
      sort: 6,
      test(_dr, track) {
        return /assets\/[^\/]+\/(?:shaders|post_effect)\/.+\.(?:glsl|fsh|vsh|json)$/.test(track.id)
      }
    },
    {
      name: 'Particles',
      sort: 7,
      test(_dr, track) {
        return /assets\/[^\/]+\/particles\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Advancements',
      sort: 8,
      test(_dr, track) {
        return /(assets|data)\/[^\/]+\/advancements?\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Loot tables',
      sort: 9,
      test(_dr, track) {
        return /(assets|data)\/[^\/]+\/loot_tables?\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Recipes',
      sort: 10,
      test(_dr, track) {
        return /(assets|data)\/[^\/]+\/recipes?\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Tags',
      sort: 11,
      test(_dr, track) {
        return /data\/[^\/]+\/tags\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Structures',
      sort: 12,
      test(_dr, track) {
        return /(assets|data)\/[^\/]+\/structures?\/.+\.nbt$/.test(track.id)
      }
    },
    {
      name: 'World generation',
      sort: 13,
      test(_dr, track) {
        return /data\/.+\/worldgen\/.+\.json$/.test(track.id)
      }
    },
  ],
}))
