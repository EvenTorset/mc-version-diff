import Content from '@/components/Content.vue'
import HexGlyphs from '@/components/HexGlyphs.vue'
import Dim from '@/components/Dim.vue'
import Row from '@/components/Row.vue'
import Spacer from '@/components/Spacer.vue'
import type { DeltaResult } from '@/delta_providers'
import { DeltaTrackState } from '@/delta_providers/states'
import { diffHex, listHex, parseHex, type Glyph } from '@/util/unifont'
import { registerViewer } from '../registry'

async function readSide(dr: DeltaResult, version: string, path: string) {
  return parseHex(new TextDecoder().decode(await dr.getEntry(version, path)))
}

registerViewer('mcje_unifont', {
  edition: 'mcje',
  test(_dr, track) {
    return track.id.endsWith('.hex')
  },
  async render(dr, track) {
    const edited = track.state === DeltaTrackState.Edited
    const side = track.state === DeltaTrackState.Removed ? 'a' : 'b'

    let glyphs: Glyph[]
    let total: number
    if (edited) {
      const [ before, after ] = await Promise.all([
        readSide(dr, dr.a, track.a),
        readSide(dr, dr.b, track.b),
      ])
      glyphs = diffHex(before, after)
      total = after.size
    } else {
      const only = await readSide(dr, side === 'a' ? dr.a : dr.b, side === 'a' ? track.a : track.b)
      glyphs = listHex(only)
      total = only.size
    }

    return () => <>
      <Row style={{ padding: '8px 12px 0' }}>
        <Dim>{edited ? 'Changed glyphs' : 'Glyphs'}</Dim>
        <Spacer bridge />
        <Dim>{glyphs.length.toLocaleString()}{edited ? ` of ${total.toLocaleString()}` : ''}</Dim>
      </Row>
      <Content content={() => <HexGlyphs glyphs={glyphs} />} />
    </>
  },
})
