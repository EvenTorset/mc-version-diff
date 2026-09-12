import { asyncRenderable } from '@/util/asyncRenderable'
import { DeltaTrackState } from '@/delta_providers/states'
import { NButton, NCheckbox, NTabPane, NTabs } from 'naive-ui'
import { trackTab } from '@/util/trackFocus'
import { defineComponent, inject, ref, Suspense, watchEffect, type Ref } from 'vue'
import Content from '@/components/Content.vue'
import { ModelViewer } from '@/components/lazyRenderers'
import Row from '@/components/Row.vue'
import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import { renderJsonTab } from './jsonTab'
import OverlayWrapper from '@/components/OverlayWrapper.vue'
import type { Renderable } from '@/types'
import Tooltip from '@/components/Tooltip.vue'
import { FullScreenMaximize24Filled, FullScreenMinimize24Filled } from '@vicons/fluent'
import type { PrepareModel } from '@/components/ModelViewer.vue'

export type ModelTrackOptions = {
  prepare?: (dr: DeltaResult, version: string, path: string, model?: string) => ReturnType<PrepareModel>
  models?: (dr: DeltaResult, version: string, path: string) => Promise<{ id: string, name: string, key: string }[]>
  noun?: string
  tab?: string
}

const ExpandButton = defineComponent({
  props: { expanded: { type: Object as () => Ref<boolean>, required: true } },
  setup(props) {
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
                icon: () => props.expanded.value ? <FullScreenMinimize24Filled /> : <FullScreenMaximize24Filled />
              }}
              onClick={() => props.expanded.value = !props.expanded.value}
            />
          )
        }}>
          {props.expanded.value ? 'Collapse' : 'Expand'}
        </Tooltip>
      )])
    })

    return () => null
  }
})

export function renderModelTrack(dr: DeltaResult, track: DeltaTrack, options: ModelTrackOptions = {}) {
  const tab = trackTab(track.id, [ '3d', 'json' ])
  const hasA = track.state === DeltaTrackState.Removed || track.state === DeltaTrackState.Edited
  const hasB = track.state !== DeltaTrackState.Removed
  const showUnchanged = ref(false)
  const unchanged = ref(0)
  const noun = options.noun ?? 'Models'

  function pair(prepare: PrepareModel | undefined, a: boolean, b: boolean, cameraKey?: string | null) {
    const expanded = ref(false)
    function viewers() {
      if (a && b) {
        return <Row gap='2px'>
          <ModelViewer dr={dr} track={track} version='a' expanded={expanded.value} prepare={prepare} cameraKey={cameraKey} />
          <ModelViewer dr={dr} track={track} version='b' expanded={expanded.value} prepare={prepare} cameraKey={cameraKey} />
        </Row>
      }
      return <ModelViewer dr={dr} track={track} version={a ? 'a' : 'b'} expanded={expanded.value} prepare={prepare} cameraKey={cameraKey} />
    }
    return () => <OverlayWrapper fit={!expanded.value}>
      {viewers()}
      <ExpandButton expanded={expanded} />
    </OverlayWrapper>
  }

  async function view_3d() {
    if (!options.models) return pair(options.prepare, hasA, hasB)
    const listed = async (present: boolean, version: string, path: string) => present ? await options.models!(dr, version, path).catch(() => []) : []
    const modelsA = await listed(hasA, dr.a, track.a)
    const modelsB = await listed(hasB, dr.b, track.b)
    const models = new Map([ ...modelsA, ...modelsB ].map(model => [ model.id, model ]))
    const rows = [ ...models.values() ].map(({ id, name }) => {
      const a = modelsA.find(model => model.id === id)
      const b = modelsB.find(model => model.id === id)
      const prepare: PrepareModel | undefined = options.prepare && ((dr, version, path) => options.prepare!(dr, version, path, id))
      const state = !a ? 'added' : !b ? 'removed' : a.key !== b.key ? 'edited' : ''
      return { id, name, state, render: pair(prepare, !!a, !!b, a && b ? `${track.id}#${id}` : null) }
    })
    if (!rows.length) return () => null
    if (rows.length === 1) return rows[0].render
    if (track.state !== DeltaTrackState.Edited) {
      return () => <div class='viewer-diff-rows'>
        {rows.map(({ id, name, render }) => <div key={id}>
          <div class='viewer-diff-row-label'>{name}</div>
          {render()}
        </div>)}
      </div>
    }
    unchanged.value = rows.filter(row => !row.state).length
    return () => <div class='viewer-diff-rows'>
      {[
        { title: `New ${noun}`, state: 'added' },
        { title: `Edited ${noun}`, state: 'edited' },
        { title: `Removed ${noun}`, state: 'removed' },
        ...showUnchanged.value ? [ { title: `Unchanged ${noun}`, state: '' } ] : [],
      ].map(section => ({ ...section, rows: rows.filter(row => row.state === section.state) })).filter(section => section.rows.length).map(section => <div key={section.state} class={`viewer-diff-section ${section.state}`}>
        <h3>{section.title}</h3>
        {section.rows.map(({ id, name, render }) => <div key={id}>
          <div class='viewer-diff-row-label'>{name}</div>
          {render()}
        </div>)}
      </div>)}
    </div>
  }
  const view3d = asyncRenderable(view_3d())
  return () => <NTabs
    type='bar'
    class='no-tab-padding pad-tab-buttons'
    value={tab.value}
    onUpdateValue={(value: string) => tab.value = value}
    size='small'
  >
    {{
      default: () => [
        <NTabPane name='3d' tab={options.tab ?? '3D View'} displayDirective='show:lazy'>
          <Suspense>
            <Content content={view3d}/>
          </Suspense>
        </NTabPane>,
        <NTabPane name='json' tab='JSON' displayDirective='show:lazy'>
          <Suspense>
            <Content content={asyncRenderable(renderJsonTab(dr, track))}/>
          </Suspense>
        </NTabPane>,
      ],
      suffix: () => tab.value === '3d' && unchanged.value ? <div class='tab-toggles'>
        <NCheckbox
          size='small'
          checked={showUnchanged.value}
          onUpdateChecked={value => showUnchanged.value = value}
        >
          <span class='toggle-count'>{unchanged.value}</span>
          Unchanged
        </NCheckbox>
      </div> : null,
    }}
  </NTabs>
}
