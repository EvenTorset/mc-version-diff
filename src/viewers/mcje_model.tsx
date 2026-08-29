import { TextDiff, TextView } from '@/components/lazyText'
import { asyncRenderable } from '@/util/asyncRenderable'
import { DeltaTrackState } from '@/delta_providers/states'
import { NButton, NTabPane, NTabs } from 'naive-ui'
import { registerViewer } from './registry'
import { trackTab } from '@/util/trackFocus'
import { Settings } from '@/settings'
import { inject, ref, Suspense, watchEffect } from 'vue'
import Content from '@/components/Content.vue'
import { ModelViewer } from '@/components/lazyRenderers'
import Row from '@/components/Row.vue'
import stringify from 'fabulous-json'
import type { DeltaResult } from '@/delta_providers'
import OverlayWrapper from '@/components/OverlayWrapper.vue'
import type { Renderable } from '@/types'
import Tooltip from '@/components/Tooltip.vue'
import { FullScreenMaximize24Filled, FullScreenMinimize24Filled } from '@vicons/fluent'

async function getJSON(dr: DeltaResult, version: string, path: string): Promise<string> {
  if (Settings.formatJSON) {
    return stringify(JSON.parse(
      new TextDecoder().decode(await dr.getEntry(version, path))
    ))
  }
  return new TextDecoder().decode(await dr.getEntry(version, path))
}

registerViewer('mcje_model', {
  test(_dr, track) {
    return /assets\/[^\/]+\/models\/.+\.json$/.test(track.id)
  },
  async render(dr, track) {
    const expanded = ref(false)
    const tab = trackTab(track.id, [ '3d', 'json' ])
    const OverlayButton = {
      setup() {
        const setOverlayButtons = inject<(buttons: Renderable[]) => void>('setOverlayButtons')

        watchEffect(() => {
          if (!setOverlayButtons) return;

          setOverlayButtons([() => (
            <Tooltip v-slots={{
              trigger: ({ props: ttp }: any) => (
                <NButton
                  {...ttp}
                  class='icon accent'
                  size='small'
                  circle
                  v-slots={{
                    icon: () => expanded.value ? <FullScreenMinimize24Filled /> : <FullScreenMaximize24Filled />
                  }}
                  onClick={() => expanded.value = !expanded.value}
                />
              )
            }}>
              {expanded.value ? 'Collapse' : 'Expand'}
            </Tooltip>
          )])
        })

        return () => null
      }
    }
    function view_3d() {
      if (track.state === DeltaTrackState.Removed) {
        return <ModelViewer dr={dr} track={track} version='a' expanded={expanded.value} />
      }
      if (
        track.state === DeltaTrackState.Added ||
        track.state === DeltaTrackState.Moved
      ) {
        return <ModelViewer dr={dr} track={track} version='b' expanded={expanded.value} />
      }
      return <Row gap='2px'>
        <ModelViewer dr={dr} track={track} version='a' expanded={expanded.value} />
        <ModelViewer dr={dr} track={track} version='b' expanded={expanded.value} />
      </Row>
    }
    async function view_json() {
      if (track.state === DeltaTrackState.Removed) {
        return <TextView
          text={await getJSON(dr, dr.a, track.a)}
          path={track.id}
        />
      }
      if (
        track.state === DeltaTrackState.Added
        || track.state === DeltaTrackState.Moved
      ) {
        return <TextView
          text={await getJSON(dr, dr.b, track.b)}
          path={track.id}
        />
      }
      return <TextDiff
        path={track.id}
        original={await getJSON(dr, dr.a, track.a)}
        modified={await getJSON(dr, dr.b, track.b)}
      />
    }
    return () => <NTabs
      type='bar'
      class='no-tab-padding pad-tab-buttons'
      value={tab.value}
      onUpdateValue={(value: string) => tab.value = value}
      size='small'
    >
      <NTabPane name='3d' tab='3D View'>
        <OverlayWrapper fit={!expanded.value}>
          <Content content={view_3d}/>
          {/* @ts-ignore */}
          <OverlayButton />
        </OverlayWrapper>
      </NTabPane>
      <NTabPane name='json' tab='JSON'>
        <Suspense>
          <Content content={asyncRenderable(view_json())}/>
        </Suspense>
      </NTabPane>
    </NTabs>
  },
})
