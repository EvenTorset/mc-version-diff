import { expandSingleLanguage } from '../category'
import { registerDeltaProvider } from '../registry'
import { editionProvider } from '../versions'
import { javaAssetsEdition } from './edition'

registerDeltaProvider('assets', editionProvider(javaAssetsEdition, {
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
      name: 'Sounds',
      sort: 1,
      test(_dr, track) {
        return /\.(?:ogg|mus)$/.test(track.id) || /assets\/[^\/]+\/sounds\.json$/.test(track.id)
      }
    },
    {
      name: 'Localization',
      sort: 2,
      expand: expandSingleLanguage,
      test(_dr, track) {
        return /assets\/[^\/]+\/lang\/.+\.(?:json|lang)$/.test(track.id)
      }
    },
    {
      name: 'Fonts',
      sort: 3,
      test(_dr, track) {
        return /assets\/[^\/]+\/font\//.test(track.id)
      }
    },
    {
      name: 'MCMETA',
      sort: 4,
      test(_dr, track) {
        return track.id.endsWith('.mcmeta')
      }
    },
  ],
}))
