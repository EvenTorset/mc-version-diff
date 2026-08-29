import { TextView } from '@/components/lazyText'
import { registerViewer } from './registry'
import { DeltaTrackState } from '@/delta_providers/states'
import LangDiff from '@/components/LangDiff.vue'

// Pre-1.13 versions use key=value lines instead of JSON
function parseLang(text: string): Record<string, string> {
  const entries: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const split = trimmed.indexOf('=')
    if (split === -1) continue
    entries[trimmed.slice(0, split)] = trimmed.slice(split + 1)
  }
  return entries
}

registerViewer('lang', {
  test(_dr, track) {
    return /assets\/[^\/]+\/lang\/(?!deprecated)[^\/]+.(json|lang)$/.test(track.id) || /^lang\/[^\/]+\.lang$/.test(track.id)
  },
  async render(dr, track) {
    const td = new TextDecoder()
    const parse = (bytes: Uint8Array) => {
      const text = td.decode(bytes)
      return track.id.endsWith('.lang') ? parseLang(text) : JSON.parse(text)
    }
    switch (track.state) {
      case DeltaTrackState.Edited: {
        const [ orig, mod ]: [
          Record<string, string>,
          Record<string, string>,
        ] = await Promise.all([
          dr.getEntry(dr.a, track.a).then(parse),
          dr.getEntry(dr.b, track.b).then(parse),
        ])
        return <LangDiff original={orig} modified={mod}/>
      }
      case DeltaTrackState.Added: return <LangDiff
        original={{}}
        modified={await dr.getEntry(dr.b, track.b).then(parse)}
      />
      case DeltaTrackState.Removed: return <LangDiff
        original={await dr.getEntry(dr.a, track.a).then(parse)}
        modified={{}}
      />
      case DeltaTrackState.Moved: return <TextView
        text={td.decode(await dr.getEntry(dr.b, track.b))}
        path={track.id}
      ></TextView>
    }
  },
})
