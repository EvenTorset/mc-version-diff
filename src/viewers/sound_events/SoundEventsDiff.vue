<script setup lang="ts">
import { computed, watch } from 'vue'
import MarkChanges from '@/components/MarkChanges.vue'
import Row from '@/components/Row.vue'
import type { DeltaResult } from '@/delta_providers/index.ts'
import PlayButton from './PlayButton.vue'

export type SoundValue = string | number | boolean | number[]

export type Sound = string | {
  name: string
  volume?: number
  pitch?: number
  type?: string
  [key: string]: SoundValue | undefined
}

export type SoundEvent = {
  sounds?: Sound[]
  subtitle?: string
  [key: string]: SoundValue | Sound[] | undefined
}

export type SoundEvents = Record<string, SoundEvent>

type State = '' | 'added' | 'removed' | 'edited'

type Chip = {
  key: string
  value: string
  was: string
  state: State
}

type Line = {
  name: string
  value: string
  was: string
  state: State
  chips: Chip[]
  pitch: number
  volume: number
  oldPitch?: number
  oldVolume?: number
}

const props = defineProps<{
  original: SoundEvents
  modified: SoundEvents
  showUnchanged?: boolean
  dr?: DeltaResult
}>()

const emit = defineEmits<{
  counts: [number]
}>()

function named(sound: Sound) {
  return typeof sound === 'string' ? { name: sound } : sound
}

const ORDER = [ 'sound', 'stream', 'preload', 'volume', 'pitch', 'weight', 'attenuation_distance' ]

const LABELS: Record<string, string> = {
  attenuation_distance: 'range',
  is3D: '3d',
}

function flag(value: SoundValue) {
  if (typeof value === 'boolean') return value
  return value === 'true' ? true : value === 'false' ? false : null
}

function label(key: string) {
  return LABELS[key] ?? key.replace(/^_+/, '').replace(/_/g, ' ')
}

function format(value: SoundValue) {
  return Array.isArray(value) ? value.join(' to ') : String(value)
}

function scalar(value: unknown): value is SoundValue {
  return typeof value !== 'object' || Array.isArray(value)
}

function rank(key: string) {
  const at = ORDER.indexOf(key)
  return at === -1 ? ORDER.length : at
}

function chipsOf(sound: Sound): Chip[] {
  const sides = named(sound)
  const parts: [ string, string ][] = []
  if (sides.type) parts.push([ sides.type, '' ])
  for (const key of Object.keys(sides).sort((a, b) => rank(a) - rank(b))) {
    if (key === 'name' || key === 'type' || key === 'sound') continue
    const value = sides[key]
    if (value === undefined || value === null || value === '' || !scalar(value)) continue
    const state = flag(value)
    if (state !== null) {
      if (state) parts.push([ label(key), '' ])
      continue
    }
    parts.push([ label(key), format(value) ])
  }
  return parts.map(([ key, value ]) => ({ key, value, was: '', state: '' as const }))
}

function traits(event: SoundEvent): string[] {
  const parts: string[] = []
  for (const key of Object.keys(event)) {
    if (key === 'sounds' || key === 'subtitle') continue
    const value = event[key]
    if (value === undefined || value === null || value === '' || !scalar(value)) continue
    if (Array.isArray(value) && !value.length) continue
    const state = flag(value)
    if (state !== null) {
      if (state) parts.push(label(key))
      continue
    }
    parts.push(key === 'category' ? String(value) : `${label(key)}: ${format(value)}`)
  }
  return parts
}

function valueOf(sound: Sound) {
  const value = named(sound).sound
  return value === undefined || value === null ? '' : String(value)
}

function lines(event: SoundEvent): Line[] {
  return (event.sounds ?? []).map(sound => ({
    name: named(sound).name,
    value: valueOf(sound),
    was: '',
    state: '' as const,
    chips: chipsOf(sound),
    pitch: typeof sound === 'object' ? sound.pitch ?? 1 : 1,
    volume: typeof sound === 'object' ? sound.volume ?? 1 : 1,
  }))
}

function diffChips(before: Chip[], after: Chip[]): Chip[] {
  const old = new Map(before.map(chip => [ chip.key, chip ]))
  const chips = after.map(chip => {
    const previous = old.get(chip.key)
    if (!previous) return { ...chip, state: 'added' as const }
    old.delete(chip.key)
    if (previous.value === chip.value) return chip
    return { ...chip, was: previous.value, state: 'edited' as const }
  })
  for (const chip of old.values()) chips.push({ ...chip, state: 'removed' })
  return chips
}

function diffLines(before: SoundEvent, after: SoundEvent): Line[] {
  const old = new Map(lines(before).map(line => [ line.name, line ]))
  const kept = new Set<string>()
  const changed: Line[] = lines(after).map(line => {
    const previous = old.get(line.name)
    if (!previous) return { ...line, state: 'added' as const }
    kept.add(line.name)
    const chips = diffChips(previous.chips, line.chips)
    const was = previous.value === line.value ? '' : previous.value
    return {
      ...line,
      oldPitch: previous.pitch,
      oldVolume: previous.volume,
      chips,
      was,
      state: was || chips.some(chip => chip.state) ? 'edited' as const : '' as const,
    }
  })
  for (const line of old.values()) {
    if (!kept.has(line.name)) changed.push({ ...line, state: 'removed' })
  }
  return changed
}

const changes = computed(() => {
  const added: [ string, SoundEvent ][] = []
  const edited: [ string, SoundEvent, SoundEvent, Line[] ][] = []
  const removed: [ string, SoundEvent ][] = []
  for (const [ key, event ] of Object.entries(props.original)) {
    if (!(key in props.modified)) removed.push([ key, event ])
  }
  for (const [ key, event ] of Object.entries(props.modified)) {
    const before = props.original[key]
    if (!before) {
      added.push([ key, event ])
      continue
    }
    const diff = diffLines(before, event)
    if (diff.some(line => line.state) || before.subtitle !== event.subtitle || traits(before).join() !== traits(event).join()) {
      edited.push([ key, before, event, diff ])
    }
  }
  return { added, edited, removed }
})

const hidden = computed(() => changes.value.edited.reduce((count, [ , , , diff ]) => count + diff.filter(line => !line.state).length, 0))

watch(hidden, value => emit('counts', value), { immediate: true })

function shown(diff: Line[]) {
  return props.showUnchanged ? diff : diff.filter(line => line.state)
}
</script>

<template>
  <div v-if="changes.added.length" class="section added">
    <h3>New Sound Events</h3>
    <div class="event" v-for="[key, event] of changes.added" :key="key">
      <div class="head">
        <code class="key">{{ key }}</code>
        <span v-for="trait of traits(event)" class="modifier">{{ trait }}</span>
      </div>
      <div v-if="event.subtitle" class="subtitle"><code>{{ event.subtitle }}</code></div>
      <div class="sounds">
        <Row v-for="line, i of lines(event)" class="sound" gap="8px">
          <PlayButton
            v-if="dr"
            :dr version="b"
            :event-id="key"
            :soundPath="line.name"
            :pitch="line.pitch"
            :volume="line.volume"
            :index="i"
          />
          {{ line.name }}
          <span v-if="line.value" class="value">{{ line.value }}</span>
          <Row>
            <Row v-for="chip of line.chips" class="modifier">
              <span>{{ chip.value ? chip.key + ':' : chip.key }}</span>
              <span v-if="chip.value">{{ chip.value }}</span>
            </Row>
          </Row>
        </Row>
      </div>
    </div>
  </div>

  <div v-if="changes.edited.length" class="section edited">
    <h3>Updated Sound Events</h3>
    <div class="event" v-for="[key, before, after, diff] of changes.edited" :key="key">
      <div class="head">
        <code class="key">{{ key }}</code>
        <template v-if="traits(before).join() === traits(after).join()">
          <span v-for="trait of traits(after)" class="modifier">{{ trait }}</span>
        </template>
      </div>
      <div v-if="traits(before).join() !== traits(after).join()" class="subtitle changed">
        <MarkChanges :original="traits(before).join(', ')" :modified="traits(after).join(', ')" />
      </div>
      <div v-if="before.subtitle !== after.subtitle" class="subtitle changed">
        <MarkChanges code :original="before.subtitle ?? ''" :modified="after.subtitle ?? ''" />
      </div>
      <div v-else-if="after.subtitle" class="subtitle"><code>{{ after.subtitle }}</code></div>
      <div class="sounds">
        <Row v-for="line, i of shown(diff)" class="sound" :class="line.state" gap="8px">
          <PlayButton
            v-if="dr && line.state !== 'added'"
            :dr
            :old="line.state !== 'removed'"
            version="a"
            :event-id="key"
            :soundPath="line.name"
            :pitch="line.oldPitch ?? line.pitch"
            :volume="line.oldVolume ?? line.volume"
            :index="i"
          />
          <PlayButton
            v-if="dr && line.state !== 'removed'"
            :dr
            :new="line.state !== 'added'"
            version="b"
            :event-id="key"
            :soundPath="line.name"
            :pitch="line.pitch"
            :volume="line.volume"
            :index="i"
          />
          {{ line.name }}
          <span v-if="line.was" class="value">
            <span class="was">{{ line.was }}</span>
            <span>&rarr;</span>
            <span class="now">{{ line.value }}</span>
          </span>
          <span v-else-if="line.value" class="value">{{ line.value }}</span>
          <Row>
            <Row v-for="chip of line.chips" class="modifier" :class="chip.state">
              <span>{{ chip.value || chip.was ? chip.key + ':' : chip.key }}</span>
              <template v-if="chip.state === 'edited'">
                <span class="was">{{ chip.was }}</span>
                <span>&rarr;</span>
                <span class="now">{{ chip.value }}</span>
              </template>
              <span v-else-if="chip.value">{{ chip.value }}</span>
            </Row>
          </Row>
        </Row>
      </div>
    </div>
  </div>

  <div v-if="changes.removed.length" class="section removed">
    <h3>Removed Sound Events</h3>
    <div class="event" v-for="[key, event] of changes.removed" :key="key">
      <div class="head">
        <code class="key">{{ key }}</code>
        <span v-for="trait of traits(event)" class="modifier">{{ trait }}</span>
      </div>
      <div v-if="event.subtitle" class="subtitle"><code>{{ event.subtitle }}</code></div>
      <div class="sounds">
        <Row v-for="line, i of lines(event)" class="sound" gap="8px">
          <PlayButton
            v-if="dr"
            :dr
            version="a"
            :event-id="key"
            :soundPath="line.name"
            :pitch="line.pitch"
            :volume="line.volume"
            :index="i"
          />
          {{ line.name }}
          <span v-if="line.value" class="value">{{ line.value }}</span>
          <Row>
            <Row v-for="chip of line.chips" class="modifier">
              <span>{{ chip.value ? chip.key + ':' : chip.key }}</span>
              <span v-if="chip.value">{{ chip.value }}</span>
            </Row>
          </Row>
        </Row>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>

.section {
  padding: 8px 12px 20px;

  &.added {
    --key-color: var(--color-success);
  }

  &.edited {
    --key-color: var(--color-accent-suppl);
  }

  &.removed {
    --key-color: var(--color-danger);
  }
}

.event {
  padding: 8px 0;

  & + .event {
    border-top: 1px solid rgb(from var(--color-5) r g b / 0.1);

    :root.light-color-scheme & {
      border-top-color: var(--color-2);
    }
  }
}

.head {
  font-weight: 600;
}

.key {
  color: var(--key-color);
}

.subtitle {
  color: var(--color-5);
  font-size: 12px;

  &.changed {
    color: var(--color-6);
  }
}

.sounds {
  margin: 4px 0 0 2px;
  padding-left: 10px;
  border-left: 2px solid rgb(from var(--color-5) r g b / 0.15);
}

.sound {
  font-family: var(--monospace-font-family);
  line-height: 1.8;

  &.added {
    color: var(--color-success);
  }

  &.removed {
    color: var(--color-danger);
    text-decoration: line-through;
  }

  &.edited {
    color: var(--color-accent-suppl);
  }
}

.value {
  display: inline-flex;
  gap: 4px;
  color: var(--color-6);

  .was {
    color: var(--color-danger);
    text-decoration: line-through;
  }

  .now {
    color: var(--color-success);
  }
}

.modifier {
  padding: 0 5px;
  border-radius: 4px;
  white-space: nowrap;
  background-color: var(--color-2);
  color: var(--color-5);
  font-family: var(--font-family);
  font-size: 12px;
  font-weight: 600;

  &.added {
    background-color: rgb(from var(--color-success) r g b / 0.2);
    color: var(--color-success);
  }

  &.removed {
    background-color: rgb(from var(--color-danger) r g b / 0.2);
    color: var(--color-danger);
    text-decoration: line-through;
  }

  .was {
    color: var(--color-danger);
    text-decoration: line-through;
  }

  .now {
    color: var(--color-success);
  }
}

</style>
