//@ts-ignore
import * as renderer from 'https://esm.sh/block-model-renderer@2'
import * as THREE from 'three'

// esm.sh serves modules only, so the library's bundled assets have to come from
// a CDN that hands back the raw file, or block entities render as nothing
renderer.configure({
  three: THREE,
  assetsUrl: 'https://cdn.jsdelivr.net/npm/block-model-renderer@2/assets.zip',
})

export const { createAnimator, getThree, loadModel, renderItem, resolveModelData } = renderer
