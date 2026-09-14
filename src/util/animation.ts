import type { DeltaResult } from '@/delta_providers'

export function animationOf(mcmeta: string) {
  try {
    return JSON.parse(mcmeta).animation ?? null
  } catch {
    return null
  }
}

function positive(value: any, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function frameSize(animation: any, spriteWidth: number, spriteHeight: number) {
  const width = positive(animation?.width, 0)
  const height = positive(animation?.height, 0)
  if (width) return { width, height: height || spriteHeight }
  if (height) return { width: spriteWidth, height }
  const min = Math.min(spriteWidth, spriteHeight)
  return { width: min, height: min }
}

export function arrayFrames(animation: any) {
  const frames = animation?.frames
  if (!Array.isArray(frames) || !frames.length) return null
  let highest = 0
  for (const frame of frames) {
    const index = typeof frame === 'number' ? frame : frame?.index ?? 0
    if (typeof index === 'number' && Number.isFinite(index) && index > highest) highest = index
  }
  return { count: frames.length, span: Math.max(1, highest + 1) }
}

export function normalizeMcmeta(mcmeta: string, stripSize = false): string {
  const meta = JSON.parse(mcmeta)
  const animation = meta?.animation
  if (!animation || typeof animation !== 'object') return mcmeta

  if (stripSize || !positive(animation.width, 0)) delete animation.width
  if (stripSize || !positive(animation.height, 0)) delete animation.height
  if (!positive(animation.frametime, 0)) delete animation.frametime

  if (Array.isArray(animation.frames)) {
    animation.frames = animation.frames.flatMap((frame: any) => {
      const index = typeof frame === 'number' ? frame : frame?.index
      if (typeof index !== 'number' || !Number.isFinite(index) || index < 0) return []
      if (typeof frame === 'number') return [ Math.floor(index) ]
      const time = positive(frame.time, 0)
      return [ time ? { index: Math.floor(index), time } : { index: Math.floor(index) } ]
    })
  }

  return JSON.stringify(meta)
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

  const frametime = positive(animation?.frametime, 1)
  const listed = animation?.frames
  const ticks = Array.isArray(listed) && listed.length
    ? listed.reduce((total: number, entry: any) =>
      total + (typeof entry === 'number' ? frametime : positive(entry?.time, frametime)), 0)
    : frames * frametime

  return { frame, frames, duration: ticks * 50 }
}

export async function readMcmeta(dr: DeltaResult, version: string, path: string) {
  try {
    const raw = new TextDecoder().decode(await dr.getEntry(version, `${path}.mcmeta`))
    return animationOf(raw) ? raw : null
  } catch {
    return null
  }
}

export function readAnimation(dr: DeltaResult, version: string, path: string) {
  return dr.getAnimation(version, path)
}
