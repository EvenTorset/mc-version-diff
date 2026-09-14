<script setup lang="ts">
import type { DeltaResult } from '@/delta_providers'
import { Play16Filled, Prohibited16Filled, Stop16Filled } from '@vicons/fluent'
import { computed } from 'vue'
import { audioSources, AudioState, audioStates } from './sharedState'
import { getAudioBuffer, getAudioContext } from '@/util/audioBuffers'
import { Settings } from '@/settings'
import Tooltip from '@/components/Tooltip.vue'
import { NIcon } from 'naive-ui'
import Notify from '@/notify'
import { errorMessage } from '@/util/errorMessage'

const props = defineProps<{
  dr: DeltaResult
  version: 'a' | 'b'
  eventId: string
  soundPath: string
  pitch: number
  volume: number
  'new'?: boolean
  old?: boolean
}>()

const key = computed(() => `${props.version},${props.eventId},${props.soundPath}`)

async function playSound() {
  if (audioStates[key.value] === AudioState.Unplayable) return;
  if (audioStates[key.value] === AudioState.Playing) {
    audioSources[key.value].stop()
    delete audioSources[key.value]
    audioStates[key.value] = AudioState.Stopped
    return;
  }

  try {
    const bytes = await props.dr.getEntry(props.dr[props.version], `assets/minecraft/sounds/${props.soundPath}.ogg`)
    const ctx = getAudioContext()
    const source = ctx.createBufferSource()
    source.detune.value = 1200 * Math.log2(props.pitch)
    source.buffer = await getAudioBuffer(bytes)

    const gainNode = ctx.createGain()
    gainNode.gain.value = props.volume * Settings.volume
    gainNode.connect(ctx.destination)

    source.connect(gainNode)

    source.addEventListener('ended', () => {
      audioStates[key.value] = AudioState.Stopped
      delete audioSources[key.value]
    })
    audioSources[key.value] = source
    audioStates[key.value] = AudioState.Playing
    source.start(0, 0)
  } catch (err) {
    Notify.error(`Failed to play sound.\n\n${errorMessage(err)}`)
    console.error(err)
    audioStates[key.value] = AudioState.Unplayable
  }
}
</script>

<template>
  <Tooltip>
    <template #trigger="{ props }">
      <div v-bind="props" class="button" :class="{ new: $props['new'], old }">
        <NIcon
          :component="
            audioStates[key] === AudioState.Playing
              ? Stop16Filled
              : audioStates[key] === AudioState.Unplayable
                ? Prohibited16Filled
                : Play16Filled
          "
          :size="16"
          @click="playSound()"
        />
      </div>
    </template>
    {{ audioStates[key] === AudioState.Playing
      ? 'Stop'
      : audioStates[key] === AudioState.Unplayable
        ? 'Unable to play'
        : 'Play'
    }}
  </Tooltip>
</template>

<style lang="scss" scoped>

.button {
  color: var(--color-5);
  cursor: pointer;

  &:hover {
    color: var(--color-6);
  }

  &.new,&.old {
    position: relative;
  }

  &::after {
    position: absolute;
    bottom: 0;
    right: 0;
    font-size: 7px;
    font-weight: 700;
    font-family: var(--font-family);
  }

  &.new {
    padding-right: 8px;

    &::after {
      content: 'New';
    }
  }

  &.old {
    padding-right: 6px;

    &::after {
      content: 'Old';
    }
  }
}

</style>
