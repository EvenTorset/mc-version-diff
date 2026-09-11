import type { DeltaResult } from '@/delta_providers'
import { getThree, ModelLoader, versionAssets } from '@/util/blockModelRenderer'
import { parseJson } from '@/util/bedrockFiles'
import { tgaToImageData } from '@/util/tga'

const TICK_RATE = 30
const MAX_CATCHUP_TICKS = TICK_RATE
const RESTART_TICKS = 8
const COLLISION_HEIGHT = 48
const FIT_SECONDS = 8

const ATLAS_TEXTURES: Record<string, string> = {
  'atlas.terrain': 'textures/blocks/stone',
  'atlas.items': 'textures/items/apple',
}
const BUILTIN_VARIABLES = /^(particle_(age|lifetime|random_\d)|emitter_(age|lifetime|random_\d)|entity_scale)$/

type ParticleEntry = { json: any, texture: string | undefined, variables: Record<string, number> }
type ParticleState = { scene: any, emitter: any, started: boolean, last: number, ticks: number, idle: number }

async function readParticle(dr: DeltaResult, version: string, path: string) {
  const json = parseJson(await dr.getEntry(version, path))
  if (!json?.particle_effect?.description?.identifier) throw new Error('No particle effect in this file')
  return json
}

async function textureDataUrl(dr: DeltaResult, version: string, texture: unknown): Promise<string | undefined> {
  if (typeof texture !== 'string' || !texture) return undefined
  const base = `resource_pack/${texture.replace(/\.(png|tga)$/i, '')}`
  for (const ext of [ '.png', '.tga' ]) {
    const bytes = await dr.getEntry(version, base + ext).catch(() => null)
    if (!bytes) continue
    let blob: Blob
    if (ext === '.png') blob = new Blob([ bytes ], { type: 'image/png' })
    else {
      const image = tgaToImageData(bytes)
      const canvas = new OffscreenCanvas(image.width, image.height)
      canvas.getContext('2d')!.putImageData(image, 0, 0)
      blob = await canvas.convertToBlob()
    }
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  }
  return undefined
}

function expressionStops(gradient: unknown): unknown[][] {
  const stops = Array.isArray(gradient) ? gradient : gradient && typeof gradient === 'object' ? Object.values(gradient) : []
  return stops.filter((stop): stop is unknown[] => Array.isArray(stop) && stop.some(value => typeof value === 'string'))
}

function normalize(json: any) {
  const copy = structuredClone(json)
  const components = copy.particle_effect.components ?? {}
  const color = components['minecraft:particle_appearance_tinting']?.color
  if (color && typeof color === 'object' && !Array.isArray(color)) {
    const stops = expressionStops(color.gradient)
    if (stops.length) components['minecraft:particle_appearance_tinting'].color = stops[0]
  }
  const uv = components['minecraft:particle_appearance_billboard']?.uv
  if (uv && typeof uv === 'object') {
    uv.texture_width ??= 1
    uv.texture_height ??= 1
  }
  return copy
}

function defaultVariable(name: string): number {
  if (/texture_?coord/.test(name) || /direction[._][xz]$/.test(name)) return 0
  if (/count|amount|num_particles/.test(name)) return 16
  if (/radius$/.test(name)) return 0.5
  return 1
}

function gameVariables(json: any): Record<string, number> {
  const text = JSON.stringify(json)
  const unconditional = text.replace(/\?\?\s*\{[^}]*\}/g, '')
  const assigned = new Set(Array.from(unconditional.matchAll(/\b(?:variable|v)\.([\w.]+)\s*=(?!=)/g), match => match[1].toLowerCase()))
  const curves = new Set(Object.keys(json.particle_effect.curves ?? {}).map(key => key.toLowerCase().replace(/^(variable|v)\./, '')))
  const out: Record<string, number> = {}
  for (const match of text.matchAll(/\b(?:variable|v)\.([\w.]+)/g)) {
    const name = match[1].toLowerCase()
    if (assigned.has(name) || curves.has(name) || BUILTIN_VARIABLES.test(name)) continue
    out[`variable.${name}`] = defaultVariable(name)
    const root = name.split('.')[0]
    if (root !== name && !curves.has(root)) out[`variable.${root}`] ??= 1
  }
  return out
}

export async function listBedrockParticles(dr: DeltaResult, version: string, path: string) {
  const json = await readParticle(dr, version, path)
  const id = String(json.particle_effect.description.identifier)
  return [ { id, name: id.replace(/^minecraft:/, ''), key: JSON.stringify(json) } ]
}

function stateOf(group: any): ParticleState | null {
  let state: ParticleState | null = null
  group.traverse((object: any) => { if (object.userData.mcbeParticle) state = object.userData.mcbeParticle })
  return state
}

export async function loadBedrockParticle(dr: DeltaResult, version: string, path: string) {
  const json = await readParticle(dr, version, path)
  const texturePath = json.particle_effect.description.basic_render_parameters?.texture
  const texture = await textureDataUrl(dr, version, ATLAS_TEXTURES[texturePath] ?? texturePath)
  const entry: ParticleEntry = { json: normalize(json), texture, variables: gameVariables(json) }
  const THREE = await getThree()
  const projected = new THREE.Vector3()

  const cullOffscreen = (group: any, emitter: any, camera: any) => {
    group.updateMatrixWorld(true)
    camera.updateMatrixWorld()
    for (const particle of emitter.particles.slice()) {
      particle.mesh.getWorldPosition(projected).project(camera)
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) particle.remove()
    }
  }

  let state: ParticleState | null = null
  const animate = (group: any, time: number, camera?: any) => {
    if (!state) state = stateOf(group)
    if (!state) return
    const { scene, emitter } = state
    if (!state.started || time < state.last) {
      if (state.started) emitter.stop(true)
      emitter.start()
      state.started = true
      state.last = time
      state.ticks = 0
      state.idle = 0
    }
    const ticks = Math.min(Math.round((time - state.last) * TICK_RATE), MAX_CATCHUP_TICKS)
    if (ticks > 0) state.last = time
    const manual = emitter.config.emitter_rate_mode === 'manual'
    const once = emitter.config.emitter_lifetime_mode === 'once'
    const collides = !!emitter.config.particle_collision_toggle
    for (let i = 0; i < ticks; i++) {
      emitter.tick()
      state.ticks++
      if (collides) for (const particle of emitter.particles.slice()) if (particle.position.y < 0) particle.remove()
      if (emitter.particles.length || !(manual ? emitter.enabled : once && !emitter.enabled)) continue
      if (++state.idle < RESTART_TICKS) continue
      state.idle = 0
      if (manual) emitter.spawnParticles(1)
      else emitter.start()
    }
    if (!camera) return
    if (ticks > 0) cullOffscreen(group, emitter, camera)
    scene.updateFacingRotation(camera)
  }

  return {
    assets: await versionAssets(dr, version),
    model: { 'mcbe:particle': entry },
    animate,
    length: FIT_SECONDS,
    fixed: true,
  }
}

export function registerParticleLoader() {
  if (ModelLoader.list().some((loader: any) => loader.name === 'mcbe_particle')) return
  ModelLoader.register({
    name: 'mcbe_particle',
    priority: 10,
    replaceElements: true,
    mergeKey(key: string, values: unknown[]) {
      if (key === 'mcbe:particle') return values[0]
    },
    match(model: any) {
      return !!model['mcbe:particle']
    },
    async build({ group, model }: any) {
      const entry: ParticleEntry = model['mcbe:particle']
      const Wintersky = (await import('wintersky')).default
      const THREE = await getThree()
      const scene = new Wintersky.Scene({ fetchTexture: () => entry.texture })
      scene.global_options.scale = 16
      scene.global_options.tick_rate = TICK_RATE
      const emitter = new Wintersky.Emitter(scene, new Wintersky.Config(scene, entry.json), { loop_mode: 'auto', parent_mode: 'world' })
      Object.assign((emitter as any).Molang.global_variables, entry.variables)
      if (entry.json.particle_effect.components?.['minecraft:particle_motion_collision'] && !emitter.config.space_local_position) {
        const anchor = new THREE.Object3D()
        anchor.add(emitter.local_space)
        emitter.local_space.position.y = COLLISION_HEIGHT
      }
      group.add(scene.space)
      const state: ParticleState = { scene, emitter, started: false, last: 0, ticks: 0, idle: 0 }
      group.userData.mcbeParticle = state
    },
  })
}
