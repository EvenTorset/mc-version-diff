import { registerViewer } from '../registry'
import { renderJsonTab } from '../jsonTab'
import { effectiveToggles, listBedrockUiControls, renderBedrockUi, UI_SCALE, type UiRender, type UiUse } from '@/util/bedrockUi'
import { useElementVisible } from '@/util/useElementVisible'
import { popupable } from '@/util/popupable'
import { asyncRenderable } from '@/util/asyncRenderable'
import { trackTab } from '@/util/trackFocus'
import { DeltaTrackState } from '@/delta_providers/states'
import { NCheckbox, NSpin, NTabPane, NTabs } from 'naive-ui'
import { defineComponent, reactive, ref, Suspense, watch } from 'vue'
import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import Content from '@/components/Content.vue'
import RawImage from '@/components/RawImage.vue'
import MediaColumn from '@/components/MediaColumn.vue'
import Row from '@/components/Row.vue'
import { ChevronDown16Filled } from '@vicons/fluent'

const MAX_WIDTH = 470

function displayScale(width: number) {
  if (width * UI_SCALE <= MAX_WIDTH) return UI_SCALE
  if (width <= MAX_WIDTH) return 1
  return MAX_WIDTH / width
}

const UiPreview = defineComponent({
  props: {
    dr: { type: Object as () => DeltaResult, required: true },
    track: { type: Object as () => DeltaTrack, required: true },
    version: { type: String as () => 'a' | 'b', required: true },
    id: { type: String, required: true },
    overrides: { type: Object as () => Record<string, boolean>, required: true },
    report: { type: Function as unknown as () => (uses: UiUse[]) => void, required: true },
    labelled: { type: Boolean, required: true },
  },
  setup(props) {
    const container = ref<HTMLDivElement>()
    const visible = useElementVisible(container)
    const result = ref<UiRender | null>(null)
    const loading = ref(true)
    const error = ref('')
    let started = false
    let generation = 0
    function render() {
      const current = ++generation
      loading.value = true
      renderBedrockUi(props.dr, props.dr[props.version], props.track[props.version], props.id, { ...props.overrides }).then(rendered => {
        if (current !== generation) return
        result.value = rendered
        if (!rendered) error.value = 'Nothing to preview'
        else props.report(rendered.uses)
      }).catch(err => {
        if (current !== generation) return
        console.error(err)
        error.value = err instanceof Error ? err.message : String(err)
      }).finally(() => {
        if (current === generation) loading.value = false
      })
    }
    watch(visible, value => {
      if (!value || started) return
      started = true
      render()
    }, { immediate: true })
    watch(() => ({ ...props.overrides }), () => {
      if (started) setTimeout(render)
    })
    return () => {
      const rendered = result.value
      const scale = rendered ? displayScale(rendered.width) : 1
      const content = rendered?.blank
        ? <div class='ui-preview-blank' style={{ width: `${rendered.width * scale}px` }}>Blank {rendered.width}×{rendered.height}</div>
        : rendered
        ? <RawImage
          bytes={rendered.bytes}
          style={{ width: `${rendered.width * scale}px`, height: `${rendered.height * scale}px` }}
          {...popupable({
            title: `${props.id} (${props.dr[props.version]})`,
            group: `${props.track.id} ${props.id}`,
            thumbnails: true,
            zoom: true,
          })}
        />
        : <div class='ui-preview-empty'>{loading.value ? <NSpin size='small' /> : error.value}</div>
      return <div ref={container} class='ui-preview'>
        {props.labelled ? <MediaColumn title={props.dr[props.version]}>{content}</MediaColumn> : content}
      </div>
    }
  },
})

function renderUiTrack(dr: DeltaResult, track: DeltaTrack) {
  const tab = trackTab(track.id, [ 'preview', 'json' ])
  const hasA = track.state === DeltaTrackState.Removed || track.state === DeltaTrackState.Edited
  const hasB = track.state !== DeltaTrackState.Removed
  const showUnchanged = ref(false)
  const unchanged = ref(0)

  function pair(id: string, a: boolean, b: boolean) {
    const overrides = reactive<Record<string, boolean>>({})
    const latest = reactive<Record<string, UiUse[]>>({})
    const order: string[] = []
    const remembered: Record<string, string> = {}
    let active = new Set<string>()
    const open = ref(false)
    let cursor = -1
    let lastOn = false
    const toggle = (name: string, value: boolean) => {
      cursor = order.indexOf(name) + 1
      lastOn = value
      overrides[name] = value
    }
    const preview = (version: 'a' | 'b') => <UiPreview dr={dr} track={track} version={version} id={id} overrides={overrides} labelled={hasA && hasB} report={uses => latest[version] = uses} />
    const toggles = () => {
      const sides = { a: latest.a ? effectiveToggles(latest.a, overrides) : null, b: latest.b ? effectiveToggles(latest.b, overrides) : null }
      const bindings = Object.assign({}, sides.a, sides.b) as Record<string, boolean>
      for (const name of Object.keys(bindings).filter(name => !order.includes(name)).sort()) {
        if (cursor === -1) order.push(name)
        else order.splice(cursor++, 0, name)
      }
      const value = (name: string) => overrides[name] ?? bindings[name]
      const enabledOf = (name: string) => {
        const enabled = name.replace(/_visible$/, '_enabled')
        return enabled !== name && enabled in bindings ? enabled : null
      }
      if (!lastOn) {
        for (const name of order.filter(name => active.has(name) && !(name in bindings))) order.splice(order.indexOf(name), 1)
      }
      active = new Set(Object.keys(bindings))
      const names = order.filter(name => !order.some(other => enabledOf(other) === name))
      if (!names.length) return null
      const seen = (side: Record<string, boolean> | null, name: string) => !!side && name in side
      const status = (name: string) => {
        if (!(name in bindings)) return remembered[name] ?? ''
        return remembered[name] = !(a && b) || (seen(sides.a, name) && seen(sides.b, name)) ? '' : seen(sides.b, name) ? 'added' : 'removed'
      }
      const groups = [ { title: 'New', state: 'added' }, { title: 'Removed', state: 'removed' }, { title: '', state: '' } ].map(group => ({ ...group, names: names.filter(name => status(name) === group.state) })).filter(group => group.names.length)
      const box = (name: string) => {
        const enabled = enabledOf(name)
        const inactive = !(name in bindings)
        const label = <span class={[ status(name) && `ui-binding-${status(name)}`, inactive && 'ui-binding-inactive' ]}>{name.slice(1)}</span>
        if (!enabled) return <NCheckbox
          key={name}
          size='small'
          disabled={inactive}
          checked={value(name) ?? false}
          onUpdateChecked={checked => {
            toggle(name, checked)
            if (checked && name.endsWith('_visible')) overrides[name.replace(/_visible$/, '_enabled')] = true
          }}
        >{label}</NCheckbox>
        const shown = value(name)
        const on = value(enabled)
        return <NCheckbox
          key={name}
          size='small'
          disabled={inactive}
          checked={shown && on}
          indeterminate={shown && !on}
          onUpdateChecked={() => {
            if (!shown) {
              toggle(name, true)
              toggle(enabled, true)
            } else if (on) toggle(enabled, false)
            else toggle(name, false)
          }}
        >{label}</NCheckbox>
      }
      return <div class='ui-bindings'>
        <button class='ui-bindings-toggle' onClick={() => open.value = !open.value}>
          <ChevronDown16Filled style={{ rotate: open.value ? '0deg' : '-90deg' }} />
          Bindings
          <span class='toggle-count'>{names.length}</span>
        </button>
        {open.value && groups.map(group => <div key={group.state} class='ui-bindings-group'>
          {group.title && <div class={`ui-bindings-title ui-binding-${group.state}`}>{group.title}</div>}
          <div class='ui-bindings-grid'>{group.names.map(box)}</div>
        </div>)}
      </div>
    }
    if (a && b) return () => <div class='ui-row'>{toggles()}<Row gap='2px'>{preview('a')}{preview('b')}</Row></div>
    return () => <div class='ui-row'>{toggles()}{preview(a ? 'a' : 'b')}</div>
  }

  async function view_preview() {
    const listed = async (present: boolean, version: string, path: string) => present ? await listBedrockUiControls(dr, version, path).catch(() => []) : []
    const controlsA = await listed(hasA, dr.a, track.a)
    const controlsB = await listed(hasB, dr.b, track.b)
    const controls = new Map([ ...controlsA, ...controlsB ].map(control => [ control.id, control ]))
    const rows = [ ...controls.values() ].map(({ id, name }) => {
      const a = controlsA.find(control => control.id === id)
      const b = controlsB.find(control => control.id === id)
      const state = !a ? 'added' : !b ? 'removed' : a.key !== b.key ? 'edited' : ''
      return { id, name, state, render: pair(id, !!a, !!b) }
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
    if (unchanged.value === rows.length) showUnchanged.value = true
    return () => <div class='viewer-diff-rows'>
      {[
        { title: 'New Elements', state: 'added' },
        { title: 'Edited Elements', state: 'edited' },
        { title: 'Removed Elements', state: 'removed' },
        ...showUnchanged.value ? [ { title: 'Unchanged Elements', state: '' } ] : [],
      ].map(section => ({ ...section, rows: rows.filter(row => row.state === section.state) })).filter(section => section.rows.length).map(section => <div key={section.state} class={`viewer-diff-section ${section.state}`}>
        <h3>{section.title}</h3>
        {section.rows.map(({ id, name, render }) => <div key={id}>
          <div class='viewer-diff-row-label'>{name}</div>
          {render()}
        </div>)}
      </div>)}
    </div>
  }

  const preview = asyncRenderable(view_preview())
  return () => <NTabs
    type='bar'
    class='no-tab-padding pad-tab-buttons'
    value={tab.value}
    onUpdateValue={(value: string) => tab.value = value}
    size='small'
  >
    {{
      default: () => [
        <NTabPane name='preview' tab='Preview' displayDirective='show:lazy'>
          <Suspense>
            <Content content={preview}/>
          </Suspense>
        </NTabPane>,
        <NTabPane name='json' tab='JSON' displayDirective='show:lazy'>
          <Suspense>
            <Content content={asyncRenderable(renderJsonTab(dr, track))}/>
          </Suspense>
        </NTabPane>,
      ],
      suffix: () => tab.value === 'preview' && unchanged.value ? <div class='tab-toggles'>
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

registerViewer('mcbe_ui', {
  edition: 'mcbe',
  test(_dr, track) {
    return /^resource_pack\/ui\/.+\.json$/.test(track.id) && !/\/_(ui_defs|global_variables)\.json$/.test(track.id)
  },
  render(dr, track) {
    return renderUiTrack(dr, track)
  },
})
