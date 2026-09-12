import { expandSingleLanguage } from '../category'
import { registerDeltaProvider } from '../registry'
import { editionProvider, REHASH_OPTION, type VersionEntry } from '../versions'
import { bedrockEdition } from './edition'

const decoder = new TextDecoder()

async function packPrefix(entries: VersionEntry[]) {
  const manifest = entries.find(e => e.path === 'manifest.json')
  if (!manifest) return 'resource_pack/'
  try {
    const json = JSON.parse(decoder.decode(await manifest.read()).replace(/^\s*\/\/.*$/gm, ''))
    const types = new Set((json.modules ?? []).map((m: any) => m.type))
    return types.has('data') || types.has('script') ? 'behavior_pack/' : 'resource_pack/'
  } catch {
    return 'resource_pack/'
  }
}

registerDeltaProvider('mcbe', editionProvider(bedrockEdition, {
  upload: {
    accept: '.zip,.mcpack',
    options: [ REHASH_OPTION ],
    async prepare(entries) {
      if (entries.some(e => /^(?:resource|behavior)_pack\//.test(e.path))) return entries
      const prefix = await packPrefix(entries)
      return entries.map(e => ({
        path: prefix + e.path,
        size: e.size,
        crc: e.crc,
        read: () => e.read(),
        raw: () => e.raw(),
      }))
    },
  },
  categories: [
    {
      name: 'Textures',
      sort: 0,
      expand: true,
      isImages: true,
      test(_dr, track) {
        return /^resource_pack\/textures\/.+\.(?:png|tga|jpg|hdr)$/.test(track.id)
      }
    },
    {
      name: 'Texture sets',
      sort: 1,
      test(_dr, track) {
        return /^resource_pack\/textures\/.+\.texture_set\.json$/.test(track.id)
      }
    },
    {
      name: 'Texture definitions',
      sort: 2,
      test(_dr, track) {
        return /^resource_pack\/textures\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Sounds',
      sort: 3,
      isSounds: true,
      test(_dr, track) {
        return /^resource_pack\/sounds(?:\.json$|\/)/.test(track.id)
      }
    },
    {
      name: 'Models',
      sort: 4,
      test(_dr, track) {
        return /^resource_pack\/models\//.test(track.id)
      }
    },
    {
      name: 'Entities',
      sort: 5,
      test(_dr, track) {
        return /^behavior_pack\/entities\/|^resource_pack\/(?:entity|attachables)\//.test(track.id)
      }
    },
    {
      name: 'Animations',
      sort: 6,
      test(_dr, track) {
        return /^resource_pack\/animations\//.test(track.id)
      }
    },
    {
      name: 'Animation controllers',
      sort: 6.5,
      test(_dr, track) {
        return /^resource_pack\/animation_controllers\//.test(track.id)
      }
    },
    {
      name: 'Render controllers',
      sort: 7,
      test(_dr, track) {
        return /^resource_pack\/render_controllers\//.test(track.id)
      }
    },
    {
      name: 'Particles',
      sort: 8,
      test(_dr, track) {
        return /^resource_pack\/particles\//.test(track.id)
      }
    },
    {
      name: 'UI',
      sort: 9,
      test(_dr, track) {
        return /^resource_pack\/ui\//.test(track.id)
      }
    },
    {
      name: 'Localization',
      sort: 10,
      expand: expandSingleLanguage,
      test(_dr, track) {
        return /^resource_pack\/texts\//.test(track.id)
      }
    },
    {
      name: 'Blocks',
      sort: 11,
      test(_dr, track) {
        return /^resource_pack\/blocks\.json$|^behavior_pack\/(?:blocks|shapes)\//.test(track.id)
      }
    },
    {
      name: 'Items',
      sort: 12,
      test(_dr, track) {
        return /^behavior_pack\/items\//.test(track.id)
      }
    },
    {
      name: 'Recipes',
      sort: 13,
      test(_dr, track) {
        return /^behavior_pack\/recipes\//.test(track.id)
      }
    },
    {
      name: 'Loot tables',
      sort: 14,
      test(_dr, track) {
        return /^behavior_pack\/loot_tables\//.test(track.id)
      }
    },
    {
      name: 'Trading',
      sort: 15,
      test(_dr, track) {
        return /^behavior_pack\/trading\//.test(track.id)
      }
    },
    {
      name: 'Spawn rules',
      sort: 16,
      test(_dr, track) {
        return /^behavior_pack\/spawn_rules\//.test(track.id)
      }
    },
    {
      name: 'Biomes',
      sort: 17,
      test(_dr, track) {
        return /^(?:behavior_pack|resource_pack)\/biomes\/|^resource_pack\/biomes_client\.json$/.test(track.id)
      }
    },
    {
      name: 'Environment',
      sort: 18,
      test(_dr, track) {
        return /^resource_pack\/(?:fogs|atmospherics|lighting|color_grading|water)\//.test(track.id)
      }
    },
    {
      name: 'Schemas',
      sort: 19,
      test(_dr, track) {
        return /^metadata\/json_schemas\//.test(track.id)
      }
    },
    {
      name: 'Metadata',
      sort: 20,
      test(_dr, track) {
        return /^metadata\//.test(track.id)
      }
    },
    {
      name: 'Documentation',
      sort: 21,
      test(_dr, track) {
        return /^documentation\//.test(track.id)
      }
    },
  ],
}))
