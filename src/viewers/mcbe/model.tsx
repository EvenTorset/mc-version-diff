import { registerViewer } from '../registry'
import { renderModelTrack } from '../modelTrack'
import { listBedrockModels, loadBedrockModel, registerBedrockLoader } from '@/viewers/mcbe/util/model'

registerViewer('mcbe_model', {
  edition: 'mcbe',
  predictedHeight: 285,
  test(_dr, track) {
    return /^resource_pack\/models\/.+\.json$/.test(track.id)
  },
  render(dr, track) {
    registerBedrockLoader()
    return renderModelTrack(dr, track, { prepare: loadBedrockModel, models: listBedrockModels })
  },
})
