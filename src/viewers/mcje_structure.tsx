import TextDiff from '@/components/TextDiff.vue'
import { registerViewer } from './registry'
import TextView from '@/components/TextView.vue'
import { DeltaTrackState } from '@/delta_providers/states'
import { readNbt } from '@/util/nbt'
import stringify from 'fabulous-json'
import type { DeltaResult } from '@/delta_providers'
import StructureViewer from '@/components/StructureViewer.vue'
import Row from '@/components/Row.vue'
import { Suspense } from 'vue'
import { NTabPane, NTabs } from 'naive-ui'
import { asyncRenderable } from '@/util/asyncRenderable'
import Content from '@/components/Content.vue'

async function jsonNbt(dr: DeltaResult, version: string, path: string): Promise<string> {
  const nbt = await dr.getEntry(version, path)
  const json = await readNbt(nbt)
  return stringify(json, {
    replace(_key, value) {
      if (typeof value === 'bigint') {
        return `${value}n`
      }
      return value
    },
  })
}

registerViewer('mcje_structure', {
  test(_dr, track) {
    return track.id.endsWith('.nbt')
  },
  async render(dr, track) {
    function view_3d() {
      if (track.state === DeltaTrackState.Removed) {
        return <StructureViewer dr={dr} track={track} version='a' />
      }
      if (
        track.state === DeltaTrackState.Added ||
        track.state === DeltaTrackState.Moved
      ) {
        return <StructureViewer dr={dr} track={track} version='b' />
      }
      return <Row gap='0'>
        <StructureViewer dr={dr} track={track} version='a' style='flex: 1;' />
        <StructureViewer dr={dr} track={track} version='b' style='flex: 1;' />
      </Row>
    }
    async function view_json() {
      if (track.state === DeltaTrackState.Removed) {
        return <TextView
          text={await jsonNbt(dr, dr.a, track.a)}
          path={`${track.id}.json`}
        />
      }
      if (
        track.state === DeltaTrackState.Added
        || track.state === DeltaTrackState.Moved
      ) {
        return <TextView
          text={await jsonNbt(dr, dr.b, track.b)}
          path={`${track.id}.json`}
        />
      }
      return <TextDiff
        path={`${track.id}.json`}
        original={await jsonNbt(dr, dr.a, track.a)}
        modified={await jsonNbt(dr, dr.b, track.b)}
      />
    }
    return () => <NTabs
      type='bar'
      class='no-tab-padding pad-tab-buttons'
      default-value='3d'
      size='small'
    >
      <NTabPane name='3d' tab='3D View'>
        <Content content={view_3d}/>
      </NTabPane>
      <NTabPane name='json' tab='JSON'>
        <Suspense>
          <Content content={asyncRenderable(view_json())}/>
        </Suspense>
      </NTabPane>
    </NTabs>
  },
})
