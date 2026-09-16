<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import type { ManifestVersion } from 'minecraft-asset-loader'
import VersionCompare, { type CompareSide } from '@/components/VersionCompare.vue'
import VersionName from './VersionName.vue'
import Row from '@/components/Row.vue'
import Spacer from '@/components/Spacer.vue'
import { Dismiss16Filled } from '@vicons/fluent'
import { typeName, useEdition } from './edition'
import { daysApart, VERSION_TIPS } from '@/util/versionFacts'
import IconButton from '../IconButton.vue'

const props = defineProps<{
  versions: ManifestVersion[]
}>()

const emit = defineEmits<{
  deselect: [version: ManifestVersion]
  swap: []
}>()

const edition = useEdition()

const loaded = shallowRef<Map<string, CompareSide>>(new Map())

async function load(version: ManifestVersion) {
  const details = await version.details()
  const extra = edition.overview ? await edition.overview(version, details) : { facts: [], links: [] }
  loaded.value = new Map(loaded.value).set(version.id, {
    facts: [
      { label: 'Released', time: new Date(version.releaseTime), tip: VERSION_TIPS.released },
      { label: 'Type', value: typeName(edition, version.type), tip: edition.typeTip ?? VERSION_TIPS.type },
      ...extra.facts,
    ],
    links: extra.links,
  })
}

watch(() => props.versions, versions => {
  for (const version of versions) {
    if (!loaded.value.has(version.id)) load(version)
  }
}, { immediate: true })

const sides = computed<CompareSide[]>(() =>
  props.versions.map(version => loaded.value.get(version.id) ?? { facts: [], links: [] }))

const between = computed(() => {
  const [ a, b ] = props.versions
  return a && b ? [ daysApart(a.releaseTime, b.releaseTime) ] : []
})

const root = ref<HTMLElement>()
const SPLIT_MS = 400

let running: AbortController | null = null
let clones: HTMLElement[] = []

function cards() {
  return Array.from(root.value?.querySelectorAll<HTMLElement>('.compare > .version-card') ?? [])
}

function cancel() {
  running?.abort()
  running = new AbortController()
  for (const clone of clones) clone.remove()
  clones = []
  root.value?.querySelector('.swap-toggle')?.classList.remove('swapping')
  for (const card of cards()) {
    card.style.transition = ''
    card.style.transform = ''
    card.style.width = ''
    card.style.zIndex = ''
  }
}

function slide(card: HTMLElement, from: DOMRect, to: DOMRect, layer: string) {
  card.style.transition = 'none'
  card.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px)`
  card.style.width = `${from.width}px`
  card.style.zIndex = layer

  root.value!.getBoundingClientRect()

  card.style.transition = `transform ${SPLIT_MS}ms ease, width ${SPLIT_MS}ms ease`
  card.style.transform = ''
  card.style.width = `${to.width}px`
  card.addEventListener('transitionend', event => {
    if (event.propertyName !== 'transform') return;
    card.style.transition = ''
    card.style.width = ''
    card.style.zIndex = ''
  }, { signal: running!.signal })
}

function ghost(card: HTMLElement, from: DOMRect, to: DOMRect) {
  const clone = card.cloneNode(true) as HTMLElement
  const base = root.value!.getBoundingClientRect()
  Object.assign(clone.style, {
    transition: 'none',
    transform: 'none',
    position: 'absolute',
    left: `${from.left - base.left}px`,
    top: `${from.top - base.top}px`,
    width: `${from.width}px`,
    margin: '0',
    zIndex: '0',
    pointerEvents: 'none',
  })
  root.value!.append(clone)
  clones.push(clone)

  clone.getBoundingClientRect()

  clone.style.transition = `transform ${SPLIT_MS}ms ease, width ${SPLIT_MS}ms ease, opacity ${SPLIT_MS}ms ease`
  clone.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px)`
  clone.style.width = `${to.width}px`
  clone.style.opacity = '0'
  setTimeout(() => clone.remove(), SPLIT_MS + 100)
}

function hold(arrow: HTMLElement, from: DOMRect, until: HTMLElement) {
  const clone = arrow.cloneNode(true) as HTMLElement
  const base = root.value!.getBoundingClientRect()
  Object.assign(clone.style, {
    position: 'absolute',
    left: `${from.left - base.left}px`,
    top: `${from.top - base.top}px`,
    width: `${from.width}px`,
    margin: '0',
    zIndex: '0',
    pointerEvents: 'none',
  })
  root.value!.append(clone)
  clones.push(clone)

  until.addEventListener('transitionend', event => {
    if (event.propertyName !== 'transform') return;
    clone.remove()
  }, { signal: running!.signal })
  setTimeout(() => clone.remove(), SPLIT_MS + 100)
}

watch(() => props.versions, async (now, before) => {
  if (now.length === before.length) {
    if (now.length !== 2 || now[0].id !== before[1].id || now[1].id !== before[0].id) return;
    const was = cards().map(card => card.getBoundingClientRect())
    cancel()
    await nextTick()
    const next = cards()
    if (next.length !== 2 || !was[1]) return;
    for (const [ i, card ] of next.entries()) slide(card, was[1 - i], card.getBoundingClientRect(), i === 0 ? '1' : '0')
    const swap = root.value?.querySelector('.swap-toggle')
    const token = running!.signal
    swap?.classList.add('swapping')
    setTimeout(() => token.aborted || swap?.classList.remove('swapping'), SPLIT_MS)
    return;
  }
  const was = cards().map(card => card.getBoundingClientRect())
  const leaving = before.findIndex(version => !now.some(v => v.id === version.id))
  const added = now.findIndex(version => !before.some(v => v.id === version.id))
  const dropped = now.length < before.length ? cards()[leaving] : null
  const clone = dropped?.cloneNode(true) as HTMLElement | undefined
  const arrow = root.value?.querySelector<HTMLElement>('.compare-arrow')
  const arrowWas = arrow?.getBoundingClientRect()

  cancel()
  await nextTick()
  const next = cards()

  if (now.length === 2 && before.length === 1 && next.length === 2 && was[0]) {
    for (const [ i, card ] of next.entries()) slide(card, was[0], card.getBoundingClientRect(), i === added ? '0' : '1')
  } else if (now.length === 1 && before.length === 2 && next.length === 1 && clone) {
    const to = next[0].getBoundingClientRect()
    slide(next[0], was[leaving === 0 ? 1 : 0], to, '1')
    ghost(clone, was[leaving], to)
    if (arrow && arrowWas) hold(arrow, arrowWas, next[0])
  }
})
</script>

<template>
  <div ref="root" class="selected">
    <VersionCompare :sides="sides" :between="between" :swappable="versions.length === 2" @swap="emit('swap')">
      <template #picker="{ index }">
        <Row class="header">
          <h3><VersionName :version="versions[index]" /></h3>
          <Spacer />
          <IconButton aria-label="Deselect" @click="emit('deselect', versions[index])">
            <Dismiss16Filled />
          </IconButton>
        </Row>
      </template>
    </VersionCompare>
  </div>
</template>

<style lang="scss" scoped>

.selected {
  position: relative;
}

.selected :deep(.links) {
  flex-direction: column;
}

.header {
  min-height: 34px;
}

.header h3 {
  margin: 0;
  font-size: 18px;
}

</style>
