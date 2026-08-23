import TextDiff from '@/components/TextDiff.vue'
import { registerViewer } from './registry'
import TextView from '@/components/TextView.vue'
import { DeltaTrackState } from '@/delta_providers/states'
import stringify from 'fabulous-json'
import { Settings } from '@/settings'

registerViewer('text', {
  test(_dr, _track) {
    // return /\.(?:txt|json|mcmeta|vsh|fsh|glsl|lang)$/.test(track.id)
    return true // fallback for all file types without a viewer registered
  },
  async render(dr, track) {
    const td = new TextDecoder()
    async function getFile(version: string, path: string): Promise<string> {
      const orig = await dr.getEntry(version, path)
      try {
        if (Settings.formatJSON && /\.(json|mcmeta)$/.test(path)) {
          return stringify(JSON.parse(td.decode(orig)), {
            maxLineLength: 60,
          })
        }
      } catch {}
      return td.decode(orig)
    }
    if (track.state === DeltaTrackState.Removed) {
      return <TextView
        text={await getFile(dr.a, track.a)}
        path={track.id}
      />
    }
    if (
      track.state === DeltaTrackState.Added
      || track.state === DeltaTrackState.Moved
    ) {
      return <TextView
        text={await getFile(dr.b, track.b)}
        path={track.id}
      />
    }
    return <TextDiff
      path={track.id}
      original={await getFile(dr.a, track.a)}
      modified={await getFile(dr.b, track.b)}
    />
  },
})
