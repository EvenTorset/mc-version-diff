import { registerDeltaProvider } from '../registry'
import { editionProvider } from '../versions'
import { javaCategories } from '../mcje/categories'
import { javaAssetsEdition } from './edition'

registerDeltaProvider('assets', editionProvider(javaAssetsEdition, {
  categories: javaCategories,
}))
