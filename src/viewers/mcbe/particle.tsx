import { registerViewer } from '../registry'
import { renderModelTrack } from '../modelTrack'
import { listBedrockParticles, loadBedrockParticle, registerParticleLoader } from '@/util/bedrockParticle'

registerViewer('mcbe_particle', {
  edition: 'mcbe',
  test(_dr, track) {
    return /^resource_pack\/particles\/.+\.json$/.test(track.id)
  },
  render(dr, track) {
    registerParticleLoader()
    return renderModelTrack(dr, track, { prepare: loadBedrockParticle, models: listBedrockParticles, noun: 'Particles', tab: 'Preview' })
  },
})
