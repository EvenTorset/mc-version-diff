import { registerViewer } from '../registry'
import { renderModelTrack } from '../modelTrack'

registerViewer('mcje_model', {
  edition: 'mcje',
  test(_dr, track) {
    return /assets\/[^\/]+\/models\/.+\.json$/.test(track.id)
  },
  render(dr, track) {
    return renderModelTrack(dr, track)
  },
})
