import TextView from '@/components/TextView.vue'
import { registerViewer } from './registry'
import { DeltaTrackState } from '@/delta_providers/states'
import LangDiff from '@/components/LangDiff.vue'

registerViewer('lang', {
  test(_dr, track) {
    return /assets\/[^\/]+\/lang\/(?!deprecated)[^\/]+.json$/.test(track.id)
  },
  async render(dr, track) {
    if (track.state === DeltaTrackState.Edited) {
      const td = new TextDecoder()
      const [ orig, mod ]: [
        Record<string, string>,
        Record<string, string>,
      ] = await Promise.all([
        dr.getEntry(dr.a, track.a).then(bytes => JSON.parse(td.decode(bytes))),
        dr.getEntry(dr.b, track.b).then(bytes => JSON.parse(td.decode(bytes))),
      ])
      return <LangDiff original={orig} modified={mod}/>
    }
    if (track.state === DeltaTrackState.Added || track.state === DeltaTrackState.Moved) {
      return <TextView
        text={new TextDecoder().decode(await dr.getEntry(dr.b, track.b))}
        path={track.id}
      ></TextView>
    }
    return <TextView
      text={new TextDecoder().decode(await dr.getEntry(dr.a, track.a))}
      path={track.id}
    ></TextView>
  },
})
