import { expandSingleLanguage } from '../category'
import { SOUNDS_PATH } from '@/viewers/mcje/sounds'
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
      name: 'Sound definitions',
      sort: 1,
      expand: true,
      test(_dr, track) {
        return SOUNDS_PATH.test(track.id)
      }
    },
    {
      name: 'Sounds',
      sort: 2,
      test(_dr, track) {
        return /\.(?:ogg|mus)$/.test(track.id)
      }
    },
    {
      name: 'Localization',
      sort: 3,
      expand: expandSingleLanguage,
      test(_dr, track) {
        return /assets\/[^\/]+\/lang\/.+\.(?:json|lang)$/.test(track.id)
      }
    },
    {
      name: 'Fonts',
      sort: 4,
      test(_dr, track) {
        return /assets\/[^\/]+\/font\//.test(track.id)
      }
    },
    {
      name: 'MCMETA',
      sort: 5,
      test(_dr, track) {
        return track.id.endsWith('.mcmeta')
      }
    },
  ],
}))
