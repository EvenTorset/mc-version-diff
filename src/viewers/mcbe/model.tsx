import { registerViewer } from '../registry'
import { renderModelTrack } from '../modelTrack'
import { listBedrockModels, loadBedrockModel, registerBedrockLoader } from '@/util/bedrockModel'

registerViewer('mcbe_model', {
  edition: 'mcbe',
  test(_dr, track) {
    return /^resource_pack\/models\/.+\.json$/.test(track.id)
  },
  render(dr, track) {
    registerBedrockLoader()
    return renderModelTrack(dr, track, { prepare: loadBedrockModel, models: listBedrockModels })
  },
})
