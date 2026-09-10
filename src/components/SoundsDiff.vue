<script setup lang="ts">
import { computed, watch } from 'vue'
import MarkChanges from './MarkChanges.vue'

export type Sound = string | {
  name: string
  volume?: number
  pitch?: number
  weight?: number
  stream?: boolean
  preload?: boolean
  attenuation_distance?: number
  type?: string
}

export type SoundEvent = {
  sounds?: Sound[]
  subtitle?: string
  category?: string
  replace?: boolean
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
  state: State
  chips: Chip[]
}

const props = defineProps<{
  original: SoundEvents
  modified: SoundEvents
  showUnchanged?: boolean
}>()

const emit = defineEmits<{
  counts: [number]
}>()

function named(sound: Sound) {
  return typeof sound === 'string' ? { name: sound } : sound
}

function chipsOf(sound: Sound): Chip[] {
  const sides = named(sound)
  const parts: [ string, string ][] = []
  if (sides.type) parts.push([ sides.type, '' ])
  if (sides.stream) parts.push([ 'stream', '' ])
  if (sides.preload) parts.push([ 'preload', '' ])
  if (sides.volume !== undefined) parts.push([ 'volume', String(sides.volume) ])
  if (sides.pitch !== undefined) parts.push([ 'pitch', String(sides.pitch) ])
  if (sides.weight !== undefined) parts.push([ 'weight', String(sides.weight) ])
  if (sides.attenuation_distance !== undefined) parts.push([ 'range', String(sides.attenuation_distance) ])
  return parts.map(([ key, value ]) => ({ key, value, was: '', state: '' as const }))
}

function traits(event: SoundEvent): string[] {
  const parts: string[] = []
  if (event.category) parts.push(event.category)
  if (event.replace) parts.push('replace')
  return parts
}

function lines(event: SoundEvent): Line[] {
  return (event.sounds ?? []).map(sound => ({ name: named(sound).name, state: '' as const, chips: chipsOf(sound) }))
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
    return { ...line, chips, state: chips.some(chip => chip.state) ? 'edited' as const : '' as const }
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
        <div v-for="line of lines(event)" class="sound">
          {{ line.name }}
          <span v-for="chip of line.chips" class="modifier">
            <span>{{ chip.key }}</span>
            <span v-if="chip.value">{{ chip.value }}</span>
          </span>
        </div>
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
        <div v-for="line of shown(diff)" class="sound" :class="line.state">
          {{ line.name }}
          <span v-for="chip of line.chips" class="modifier" :class="chip.state">
            <span>{{ chip.key }}</span>
            <template v-if="chip.state === 'edited'">
              <span class="was">{{ chip.was }}</span>
              <span class="arrow">&rarr;</span>
              <span class="now">{{ chip.value }}</span>
            </template>
            <span v-else-if="chip.value">{{ chip.value }}</span>
          </span>
        </div>
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
        <div v-for="line of lines(event)" class="sound">
          {{ line.name }}
          <span v-for="chip of line.chips" class="modifier">
            <span>{{ chip.key }}</span>
            <span v-if="chip.value">{{ chip.value }}</span>
          </span>
        </div>
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

.modifier {
  display: inline-flex;
  gap: 4px;
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 4px;
  white-space: nowrap;
  background-color: var(--color-2);
  color: var(--color-6);
  font-family: var(--font-family);
  font-size: 12px;
  font-weight: 500;

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

  .arrow {
    color: var(--color-4);
  }

  .now {
    color: var(--color-success);
  }
}

</style>
