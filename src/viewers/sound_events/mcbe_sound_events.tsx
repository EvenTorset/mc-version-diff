import Content from '@/components/Content.vue'
import SoundEventsDiff, { type SoundEvent, type SoundEvents, type SoundValue } from './SoundEventsDiff.vue'
import type { DeltaResult } from '@/delta_providers'
import { DeltaTrackState } from '@/delta_providers/states'
import { trackTab } from '@/util/trackFocus'
import { asyncRenderable } from '@/util/asyncRenderable'
import { NCheckbox, NTabPane, NTabs } from 'naive-ui'
import { ref, Suspense } from 'vue'
import { registerViewer } from '../registry'
import { renderJsonTab } from '../jsonTab'

export const DEFINITIONS_PATH = /^resource_pack\/sounds\/sound_definitions\.json$/
export const EVENTS_PATH = /^resource_pack\/sounds\.json$/
export const MUSIC_PATH = /^resource_pack\/sounds\/music_definitions\.json$/

type EventSound = string | Record<string, SoundValue>

type EventGroup = {
  events?: Record<string, EventSound>
  [key: string]: unknown
}

const decoder = new TextDecoder()

async function readJson(dr: DeltaResult, version: string, path: string) {
  return JSON.parse(decoder.decode(await dr.getEntry(version, path)).replace(/^\s*\/\/.*$/gm, ''))
}

function groupEvent(group: EventGroup): SoundEvent {
  const event: SoundEvent = { sounds: [] }

  for (const [ key, value ] of Object.entries(group)) {
    if (key === 'events' || key === 'variants') continue
    event[key] = value as SoundValue
  }

  for (const [ name, sound ] of Object.entries(group.events ?? {})) {
    event.sounds!.push(typeof sound === 'string' ? { name, sound } : { ...sound, name })
  }

  return event
}

function namedEvent(sound: EventSound): SoundEvent {
  if (typeof sound === 'string') return { sounds: [ sound ] }
  const { sound: name, ...rest } = sound
  return { sounds: [ { name: String(name ?? ''), ...rest } ] }
}

function readGroups(events: SoundEvents, prefix: string, groups: Record<string, EventGroup> | undefined) {
  for (const [ name, group ] of Object.entries(groups ?? {})) {
    if (!group) continue
    events[`${prefix}/${name}`] = groupEvent(group)
    const map = (group.variants as { map?: Record<string, EventGroup> } | undefined)?.map
    for (const [ variant, body ] of Object.entries(map ?? {})) {
      if (body) events[`${prefix}/${name}/${variant}`] = groupEvent(body)
    }
  }
}

function readEntities(events: SoundEvents, prefix: string, section: any) {
  if (section?.defaults) events[`${prefix}/defaults`] = groupEvent(section.defaults)
  readGroups(events, prefix, section?.entities)
}

function readNamed(events: SoundEvents, prefix: string, sounds: Record<string, EventSound> | undefined) {
  for (const [ name, sound ] of Object.entries(sounds ?? {})) {
    events[`${prefix}/${name}`] = namedEvent(sound)
  }
}

function flattenMusic(json: any): SoundEvents {
  const events: SoundEvents = {}
  for (const [ name, music ] of Object.entries(json ?? {}) as [ string, Record<string, SoundValue> ][]) {
    if (!music) continue
    const { event_name, ...rest } = music
    events[name] = { sounds: [ { name: String(event_name ?? ''), ...rest } ] }
  }
  return events
}

function flattenEvents(json: any): SoundEvents {
  const events: SoundEvents = {}
  readGroups(events, 'block_sounds', json?.block_sounds)
  readEntities(events, 'entity_sounds', json?.entity_sounds)
  readNamed(events, 'individual_event_sounds', json?.individual_event_sounds?.events)
  readNamed(events, 'individual_named_sounds', json?.individual_named_sounds?.sounds)
  readGroups(events, 'interactive_sounds/block_sounds', json?.interactive_sounds?.block_sounds)
  readEntities(events, 'interactive_sounds/entity_sounds', json?.interactive_sounds?.entity_sounds)
  return events
}

function soundsViewer(id: string, test: RegExp, read: (json: any) => SoundEvents) {
  registerViewer(id, {
    edition: 'mcbe',
    test(_dr, track) {
      return test.test(track.id)
    },
    async render(dr, track) {
      const single = track.state === DeltaTrackState.Removed
        ? 'a'
        : track.state === DeltaTrackState.Added || track.state === DeltaTrackState.Moved
          ? 'b'
          : null

      const [ before, after ] = await Promise.all([
        single === 'b' ? {} : readJson(dr, dr.a, track.a).then(read),
        single === 'a' ? {} : readJson(dr, dr.b, track.b).then(read),
      ])

      const showUnchanged = ref(false)
      const unchanged = ref(0)
      const tab = trackTab(track.id, [ 'sounds', 'json' ])

      function view_sounds() {
        return <SoundEventsDiff
          dr={track.id.endsWith('/sounds.json') ? undefined : dr}
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
}

soundsViewer('mcbe_sound_definitions', DEFINITIONS_PATH, json => json?.sound_definitions ?? {})
soundsViewer('mcbe_sounds', EVENTS_PATH, flattenEvents)
soundsViewer('mcbe_music_definitions', MUSIC_PATH, flattenMusic)
