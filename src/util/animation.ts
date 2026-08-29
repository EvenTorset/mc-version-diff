import type { DeltaResult } from '@/delta_providers'

export function animationOf(mcmeta: string) {
  try {
    return JSON.parse(mcmeta).animation ?? null
  } catch {
    return null
  }
}

function frameSize(animation: any, spriteWidth: number, spriteHeight: number) {
  if (animation?.width !== undefined) {
    return { width: animation.width, height: animation.height ?? spriteHeight }
  }
  if (animation?.height !== undefined) return { width: spriteWidth, height: animation.height }
  const min = Math.min(spriteWidth, spriteHeight)
  return { width: min, height: min }
}

export function arrayFrames(animation: any) {
  const frames = animation?.frames
  if (!Array.isArray(frames) || !frames.length) return null
  const highest = Math.max(...frames.map((frame: any) =>
    typeof frame === 'number' ? frame : frame?.index ?? 0))
  return { count: frames.length, span: Math.max(1, highest + 1) }
}

export type Playhead = { frame: number, next?: number, progress?: number }

export function frameOffset(
  spriteWidth: number,
  frame: { width: number, height: number },
  index: number,
) {
  const columns = Math.max(1, Math.floor(spriteWidth / frame.width))
  return {
    x: (index % columns) * frame.width,
    y: Math.floor(index / columns) * frame.height,
  }
}

export function animationStats(animation: any, spriteWidth: number, spriteHeight: number) {
  const frame = frameSize(animation, spriteWidth, spriteHeight)
  const sheetFrames = Math.max(1, Math.round(
    (spriteWidth / frame.width) * (spriteHeight / frame.height)))
  const frames = arrayFrames(animation)?.count ?? sheetFrames

  const frametime = animation?.frametime ?? 1
  const listed = animation?.frames
  const ticks = Array.isArray(listed) && listed.length
    ? listed.reduce((total: number, entry: any) =>
      total + (typeof entry === 'number' ? frametime : entry?.time ?? frametime), 0)
    : frames * frametime

  return { frame, frames, duration: ticks * 50 }
}

export async function readAnimation(dr: DeltaResult, version: string, path: string) {
  try {
    const raw = new TextDecoder().decode(await dr.getEntry(version, `${path}.mcmeta`))
    return animationOf(raw) ? raw : null
  } catch {
    return null
  }
}
