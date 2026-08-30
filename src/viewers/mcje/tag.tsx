import { TextDiff, TextView } from '@/components/lazyText'
import Content from '@/components/Content.vue'
import TagDiff from '@/components/TagDiff.vue'
import type { DeltaResult } from '@/delta_providers'
import { DeltaTrackState } from '@/delta_providers/states'
import { Settings } from '@/settings'
import { parseTag, TAG_PATH } from '@/util/tag'
import { trackTab } from '@/util/trackFocus'
import stringify from 'fabulous-json'
import { NCheckbox, NTabPane, NTabs } from 'naive-ui'
import { ref } from 'vue'
import { registerViewer } from '../registry'

async function readSide(dr: DeltaResult, version: string, path: string) {
  const raw = new TextDecoder().decode(await dr.getEntry(version, path))
  try {
    return { raw, tag: parseTag(raw) }
  } catch {
    return { raw, tag: null }
  }
}

function getJSON(raw: string) {
  if (!Settings.formatJSON) return raw
  try {
    return stringify(JSON.parse(raw), { maxLineLength: 60 })
  } catch {
    return raw
  }
}

registerViewer('mcje_tag', {
  test(_dr, track) {
    return TAG_PATH.test(track.id)
  },
  async render(dr, track) {
    const single = track.state === DeltaTrackState.Removed
      ? 'a'
      : track.state === DeltaTrackState.Added || track.state === DeltaTrackState.Moved
        ? 'b'
        : null

    const before = single === 'b' ? null : await readSide(dr, dr.a, track.a)
    const after = single === 'a' ? null : await readSide(dr, dr.b, track.b)

    function view_json() {
      if (!before) return <TextView text={getJSON(after!.raw)} path={track.id} />
      if (!after) return <TextView text={getJSON(before.raw)} path={track.id} />
      return <TextDiff path={track.id} original={getJSON(before.raw)} modified={getJSON(after.raw)} />
    }

    if (before?.tag === null || after?.tag === null) return view_json

    const showUnchanged = ref(false)
    const counts = ref<{ unchanged: number } | null>(null)

    function view_tag() {
      return <TagDiff
        original={before?.tag ?? null}
        modified={after?.tag ?? null}
        showUnchanged={showUnchanged.value}
        onCounts={value => counts.value = value}
      />
    }

    const tab = trackTab(track.id, [ 'tag', 'json' ])

    return () => <>
      <NTabs
        type='bar'
        class='no-tab-padding pad-tab-buttons'
        size='small'
        value={tab.value}
        onUpdateValue={(value: string) => tab.value = value}
      >
        {{
          default: () => [
            <NTabPane name='tag' tab='Tag' displayDirective='show:lazy'>
              <Content content={view_tag} />
            </NTabPane>,
            <NTabPane name='json' tab='JSON' displayDirective='show:lazy'>
              <Content content={view_json} />
            </NTabPane>,
          ],
          suffix: () => tab.value === 'tag' && counts.value?.unchanged ? <div class='tab-toggles'>
            <NCheckbox
              size='small'
              checked={showUnchanged.value}
              onUpdateChecked={value => showUnchanged.value = value}
            >
              <span class='toggle-count'>{counts.value.unchanged}</span>
              Unchanged
            </NCheckbox>
          </div> : null,
        }}
      </NTabs>
    </>
  },
})
