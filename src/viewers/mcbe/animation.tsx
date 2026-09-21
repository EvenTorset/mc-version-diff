import { registerViewer } from '../registry'
import { renderModelTrack } from '../modelTrack'
import { listBedrockAnimations, loadBedrockAnimation, registerBedrockLoader } from '@/viewers/mcbe/util/model'

registerViewer('mcbe_animation', {
  edition: 'mcbe',
  test(_dr, track) {
    return /^resource_pack\/animations\/.+\.json$/.test(track.id)
  },
  render(dr, track) {
    registerBedrockLoader()
    return renderModelTrack(dr, track, { prepare: loadBedrockAnimation, models: listBedrockAnimations, noun: 'Animations' })
  },
})
