import Content from '@/components/Content.vue'
import SoundsDiff, { type SoundEvents } from '@/components/SoundsDiff.vue'
import type { DeltaResult } from '@/delta_providers'
import { DeltaTrackState } from '@/delta_providers/states'
import { trackTab } from '@/util/trackFocus'
import { asyncRenderable } from '@/util/asyncRenderable'
import { NCheckbox, NTabPane, NTabs } from 'naive-ui'
import { ref, Suspense } from 'vue'
import { registerViewer } from '../registry'
import { renderJsonTab } from '../jsonTab'

export const SOUNDS_PATH = /(?:^|\/)assets\/[^\/]+\/sounds\.json$/

async function readSide(dr: DeltaResult, version: string, path: string): Promise<SoundEvents> {
  return JSON.parse(new TextDecoder().decode(await dr.getEntry(version, path)))
}

registerViewer('mcje_sounds', {
  edition: 'mcje',
  test(_dr, track) {
    return SOUNDS_PATH.test(track.id)
  },
  async render(dr, track) {
    const single = track.state === DeltaTrackState.Removed
      ? 'a'
      : track.state === DeltaTrackState.Added || track.state === DeltaTrackState.Moved
        ? 'b'
        : null

    const [ before, after ] = await Promise.all([
      single === 'b' ? {} : readSide(dr, dr.a, track.a),
      single === 'a' ? {} : readSide(dr, dr.b, track.b),
    ])

    const showUnchanged = ref(false)
    const unchanged = ref(0)
    const tab = trackTab(track.id, [ 'sounds', 'json' ])

    function view_sounds() {
      return <SoundsDiff
        original={before}
        modified={after}
        showUnchanged={showUnchanged.value}
        onCounts={value => unchanged.value = value}
      />
    }

    return () => <NTabs
      type='bar'
      class='no-tab-padding pad-tab-buttons'
      size='small'
      value={tab.value}
      onUpdateValue={(value: string) => tab.value = value}
    >
      {{
        default: () => [
          <NTabPane name='sounds' tab='Sounds' displayDirective='show:lazy'>
            <Content content={view_sounds} />
          </NTabPane>,
          <NTabPane name='json' tab='JSON' displayDirective='show:lazy'>
            <Suspense>
              <Content content={asyncRenderable(renderJsonTab(dr, track))} />
            </Suspense>
          </NTabPane>,
        ],
        suffix: () => tab.value === 'sounds' && unchanged.value ? <div class='tab-toggles'>
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
  },
})
