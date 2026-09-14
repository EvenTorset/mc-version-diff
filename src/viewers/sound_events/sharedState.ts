import { reactive } from 'vue'

export enum AudioState {
  Stopped,
  Playing,
  Unplayable,
}
export const audioStates = reactive<Record<string, AudioState>>({})
export const audioSources: Record<string, AudioBufferSourceNode> = {}
