import Molang from 'molangjs'
import type { DeltaResult } from '@/delta_providers'
import { listFiles, parseJson } from '@/util/bedrockFiles'

type Vec3 = [ number, number, number ]

export type Pose = {
  rotation: Vec3
  scale: Vec3
  position: Vec3
}

export type Transform = Pose

export type Rest = Record<string, { rotation: Vec3, position: Vec3 }>

export type Properties = Record<string, string | number>

export type PropertyDef = {
  default: string | number
  values: (string | number)[]
}

export type AnimationSets = {
  animations: Map<string, any>
  controllers: Map<string, any>
  files: Map<string, string[]>
  properties: Map<string, Record<string, PropertyDef>>
}

export type Evaluate = (expression: unknown, variables?: Record<string, number>) => number

const CHANNELS = [ 'rotation', 'scale', 'position' ] as const

function blankPose(): Pose {
  return { rotation: [ 0, 0, 0 ], scale: [ 1, 1, 1 ], position: [ 0, 0, 0 ] }
}

function copyPose(pose: Pose | undefined): Pose {
  return pose ? { rotation: [ ...pose.rotation ], scale: [ ...pose.scale ], position: [ ...pose.position ] } : blankPose()
}

function molangValue(value: unknown): string | number {
  if (typeof value === 'boolean') return Number(value)
  if (typeof value === 'number') return value
  if (typeof value === 'string') return `'${value}'`
  return 0
}

export async function readAnimations(dr: DeltaResult, version: string): Promise<AnimationSets> {
  const animations = new Map<string, any>()
  const controllers = new Map<string, any>()
  const files = new Map<string, string[]>()
  for (const [ dir, key, into ] of [
    [ 'resource_pack/animations', 'animations', animations ],
    [ 'resource_pack/animation_controllers', 'animation_controllers', controllers ],
  ] as const) {
    for (const path of await listFiles(dr, version, dir)) {
      if (!path.endsWith('.json')) continue
      try {
        const entries = Object.entries(parseJson(await dr.getEntry(version, path))[key] ?? {})
        for (const [ name, def ] of entries) into.set(name, def)
        files.set(path, entries.map(([ name ]) => name))
      } catch {}
    }
  }
  const properties = new Map<string, Record<string, PropertyDef>>()
  for (const path of await listFiles(dr, version, 'behavior_pack/entities')) {
    if (!path.endsWith('.json')) continue
    try {
      const description = parseJson(await dr.getEntry(version, path))['minecraft:entity']?.description
      if (!description?.identifier || !description.properties) continue
      const defs: Record<string, PropertyDef> = {}
      for (const [ name, property ] of Object.entries<any>(description.properties)) {
        const values = property?.type === 'bool'
          ? [ 0, 1 ]
          : Array.isArray(property?.values) ? property.values.map(molangValue) : [ molangValue(property?.default) ]
        defs[name] = { default: molangValue(property?.default), values }
      }
      properties.set(String(description.identifier).replace(/^minecraft:/, ''), defs)
    } catch {}
  }
  return { animations, controllers, files, properties }
}

export function entityPropertyDefs(description: any, sets: AnimationSets): Record<string, PropertyDef> {
  return sets.properties.get(String(description?.identifier ?? '').replace(/^minecraft:/, '')) ?? {}
}

export function entityProperties(description: any, sets: AnimationSets, overrides: Properties = {}): Properties {
  const out: Properties = {}
  for (const [ name, def ] of Object.entries(entityPropertyDefs(description, sets))) out[name] = def.default
  return { ...out, ...overrides }
}

export function molangEvaluator(globals: Record<string, number> = {}, properties: Properties = {}): { evaluate: Evaluate, parser: any } {
  const parser = new Molang()
  parser.global_variables = { true: 1, false: 0, ...globals }
  parser.variableHandler = (key, _variables, args) => {
    const name = String((args as unknown as unknown[] | undefined)?.[0] ?? '').replace(/'/g, '')
    if (key === 'query.property') return (properties[name] ?? 0) as number
    if (key === 'query.has_property') return name in properties ? 1 : 0
    return 0
  }
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0
  const evaluate: Evaluate = (expression, variables = {}) => {
    if (typeof expression === 'number') return expression
    if (typeof expression !== 'string') return 0
    try {
      return finite(parser.parse(expression, variables))
    } catch {
      return 0
    }
  }
  return { evaluate, parser }
}

export function runScripts(description: any, evaluate: Evaluate, parser: any) {
  for (const line of description?.scripts?.pre_animation ?? []) {
    for (const statement of String(line).split(';')) {
      const assignment = /^\s*((?:variable|v|temp|t)\.\w+)\s*=(?!=)([^]*)$/.exec(statement)
      if (assignment) parser.parse(`${assignment[1]} = ${evaluate(assignment[2])}`)
      else if (statement.trim()) evaluate(statement)
    }
  }
}

export function visibleParts(evaluate: Evaluate, description: any, controllers: Map<string, any>, geometryName: string, bones: string[], optimistic = false): Set<string> {
  const names = bones.map(bone => bone.toLowerCase())
  const passes: Map<string, boolean>[] = []
  for (const entry of description?.render_controllers ?? []) {
    const [ name, condition ] = typeof entry === 'string' ? [ entry, null ] : Object.entries<any>(entry)[0] ?? []
    if (!name || (condition !== null && !evaluate(condition))) continue
    const controller = controllers.get(name)
    if (!controller) continue
    const geometry = String(controller.geometry ?? '')
    const uses = geometry.startsWith('Array.')
      ? (controller.arrays?.geometries?.[geometry.replace(/\[.*$/, '')] ?? []).some((id: string) => id.toLowerCase() === `geometry.${geometryName.toLowerCase()}`)
      : new RegExp(`geometry\\.${geometryName}(?![\\w.])`, 'i').test(geometry)
    if (!uses) continue
    const visible = new Map(names.map(bone => [ bone, true ]))
    for (const rule of controller.part_visibility ?? []) {
      const [ pattern, expression ] = Object.entries<any>(rule)[0] ?? []
      if (!pattern) continue
      const matcher = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i')
      const literal = typeof expression === 'boolean' ? expression : /^\s*(true|false)\s*$/i.test(String(expression)) ? /true/i.test(String(expression)) : null
      const shown = literal !== null ? literal : optimistic || !!evaluate(expression)
      for (const bone of names) if (matcher.test(bone)) visible.set(bone, shown)
    }
    passes.push(visible)
  }
  if (!passes.length) return new Set()
  const hidden = new Set(names.filter(bone => passes.every(pass => !pass.get(bone))))
  if (!optimistic && names.length && hidden.size === names.length) return visibleParts(evaluate, description, controllers, geometryName, bones, true)
  return hidden
}

export function hiddenBones(description: any, controllers: Map<string, any>, geometryName: string, bones: string[], sets: AnimationSets, globals: Record<string, number> = {}, overrides: Properties = {}): Set<string> {
  const { evaluate, parser } = molangEvaluator(globals, entityProperties(description, sets, overrides))
  runScripts(description, evaluate, parser)
  return visibleParts(evaluate, description, controllers, geometryName, bones)
}

function keyframes(value: any): { time: number, pre: any, post: any, mode?: string }[] {
  if (value === null || value === undefined) return []
  if (typeof value !== 'object' || Array.isArray(value)) return [ { time: 0, pre: value, post: value } ]
  return Object.entries<any>(value)
    .map(([ key, frame ]) => ({ time: Number(key), frame }))
    .filter(entry => !Number.isNaN(entry.time))
    .sort((a, b) => a.time - b.time)
    .map(({ time, frame }) => frame && typeof frame === 'object' && !Array.isArray(frame)
      ? { time, pre: frame.pre ?? frame.post, post: frame.post ?? frame.pre, mode: frame.lerp_mode }
      : { time, pre: frame, post: frame })
}

function triple(value: any): (number | string)[] | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.length === 3 ? value : null
  return [ value, value, value ]
}

function isKeyframed(value: any) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

type Sample = { from: (number | string)[], to: (number | string)[], factor: number, prev: (number | string)[] | null, next: (number | string)[] | null }

function channelAt(frames: ReturnType<typeof keyframes>, t: number): Sample | null {
  let index = 0
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].time <= t) index = i
    else break
  }
  const before = frames[index]
  const after = frames[Math.min(index + 1, frames.length - 1)]
  const from = triple(before.post)
  const to = triple(after.time > before.time ? after.pre : before.post)
  if (!from || !to) return null
  const factor = after.time > before.time ? Math.min(Math.max((t - before.time) / (after.time - before.time), 0), 1) : 0
  const spline = before.mode === 'catmullrom' || after.mode === 'catmullrom'
  const prev = spline && index > 0 ? triple(frames[index - 1].post) : null
  const next = spline && index + 2 < frames.length ? triple(frames[index + 2].pre) : null
  return { from, to, factor, prev: spline ? prev : null, next: spline ? next : null }
}

function interpolate(at: Sample, axis: number, evaluate: Evaluate, variables: Record<string, number>): number {
  const a = evaluate(at.from[axis], variables)
  if (!at.factor) return a
  const b = evaluate(at.to[axis], variables)
  if (!at.prev && !at.next) return a + (b - a) * at.factor
  const p0 = at.prev ? evaluate(at.prev[axis], variables) : a
  const p3 = at.next ? evaluate(at.next[axis], variables) : b
  const t = at.factor
  return 0.5 * (2 * a + (b - p0) * t + (2 * p0 - 5 * a + 4 * b - p3) * t * t + (3 * a - p0 - 3 * b + p3) * t * t * t)
}

const MEAN_SAMPLES = 16

export function animationLength(animation: any): number {
  if (typeof animation?.animation_length === 'number') return animation.animation_length
  let length = 0
  for (const channels of Object.values<any>(animation?.bones ?? {})) {
    for (const channel of CHANNELS) {
      for (const frame of keyframes(channels?.[channel])) length = Math.max(length, frame.time)
    }
  }
  return length
}

function restValue(rest: Rest | undefined, bone: string, channel: typeof CHANNELS[number], axis: number) {
  if (channel === 'scale') return 1
  return rest?.[bone]?.[channel]?.[axis] ?? 0
}

export function sampleAnimation(animation: any, time: number, evaluate: Evaluate, animTime = time, seed: Record<string, Pose> = {}, rest?: Rest): Record<string, Transform> {
  const length = animationLength(animation)
  const t = animation?.loop === true && length > 0 ? animTime % length : Math.min(animTime, length || animTime)
  const queries = { 'query.anim_time': t, 'query.life_time': time }
  const out: Record<string, Transform> = {}
  for (const [ boneName, channels ] of Object.entries<any>(animation?.bones ?? {})) {
    const bone = boneName.toLowerCase()
    const transform = copyPose(seed[bone])
    for (const channel of CHANNELS) {
      const frames = keyframes(channels?.[channel])
      if (!frames.length) continue
      const at = channelAt(frames, t)
      if (!at) continue
      const current = transform[channel]
      for (let axis = 0; axis < 3; axis++) {
        const self = restValue(rest, bone, channel, axis) + current[axis]
        const value = interpolate(at, axis, evaluate, { ...queries, this: self })
        current[axis] = channel === 'scale' ? current[axis] * value : current[axis] + value
      }
    }
    out[bone] = transform
  }
  return out
}

function firstFrame(value: any): any {
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) return value
  const times = Object.keys(value).map(Number).filter(n => !Number.isNaN(n)).sort((a, b) => a - b)
  if (!times.length) return undefined
  const frame = value[String(times[0])] ?? value[times[0].toFixed(1)] ?? Object.values(value)[0]
  return frame && typeof frame === 'object' && !Array.isArray(frame) ? frame.post ?? frame.pre : frame
}

function components(value: any): (number | string)[] | null {
  const frame = firstFrame(value)
  if (frame === undefined) return null
  if (Array.isArray(frame)) return frame.length === 3 ? frame : null
  return [ frame, frame, frame ]
}

const TIME_QUERIES = [ 'query.life_time', 'query.anim_time', 'query.time_stamp', 'query.delta_time', 'query.frame_alpha', 'query.modified_distance_moved', 'query.distance_from_camera' ]

function activeAnimations(description: any, sets: AnimationSets, evaluate: Evaluate, skip?: string): string[] {
  const out: string[] = []
  const entriesOf = (entries: any[]): [string, any][] => (entries ?? []).flatMap(entry => typeof entry === 'string' ? [ [ entry, null ] ] : Object.entries<any>(entry ?? {}))
  const runController = (id: string, depth: number) => {
    const controller = sets.controllers.get(id)
    if (!controller?.states) return
    const initial = controller.initial_state ?? 'default'
    let name = initial
    const visited = new Set<string>()
    while (!visited.has(name)) {
      visited.add(name)
      const next = (controller.states[name]?.transitions ?? []).find((entry: any) => evaluate(Object.values(entry)[0]))
      if (!next) break
      name = Object.keys(next)[0]
    }
    const holds = (state: string) => entriesOf(controller.states[state]?.animations).some(([ key ]) => (description.animations?.[key] ?? key) === skip)
    if (skip && !holds(name)) name = [ initial ].concat(Object.keys(controller.states)).find(holds) ?? name
    run(controller.states[name]?.animations ?? [], depth + 1)
  }

  const run = (entries: any[], depth: number) => {
    if (depth > 4) return
    for (const [ key, condition ] of entriesOf(entries)) {
      if (!key) continue
      if (condition !== null && !evaluate(condition)) continue
      const id = description.animations?.[key] ?? key
      if (sets.controllers.has(id)) runController(id, depth)
      else if (id !== skip && !out.includes(id)) out.push(id)
    }
  }

  for (const entry of description.animation_controllers ?? []) {
    const id = typeof entry === 'string' ? entry : Object.values<string>(entry)[0]
    if (id) runController(id, 0)
  }
  run(description.scripts?.animate ?? [], 0)
  return out
}

function poseAt(description: any, sets: AnimationSets, time: number, skip: string | undefined, globals: Record<string, number>, rest: Rest | undefined, overrides: Properties): { pose: Record<string, Pose>, keyed: Set<string> } {
  const { evaluate, parser } = molangEvaluator({ ...globals, ...Object.fromEntries(TIME_QUERIES.map(name => [ name, time ])) }, entityProperties(description, sets, overrides))

  runScripts(description, evaluate, parser)

  const pose: Record<string, Pose> = {}
  const keyed = new Set<string>()
  const poseOf = (bone: string) => pose[bone] ??= blankPose()

  for (const name of activeAnimations(description, sets, evaluate, skip)) {
    const animation = sets.animations.get(name)
    if (!animation?.bones) continue
    const length = animationLength(animation)
    for (const [ boneName, channels ] of Object.entries<any>(animation.bones)) {
      const bone = boneName.toLowerCase()
      for (const channel of CHANNELS) {
        const values = components(channels?.[channel])
        if (!values) continue
        const current = poseOf(bone)[channel]
        const frames = isKeyframed(channels[channel]) && length > 0 ? keyframes(channels[channel]) : null
        for (let axis = 0; axis < 3; axis++) {
          const self = restValue(rest, bone, channel, axis) + current[axis]
          let value: number
          if (frames && frames.length > 1) {
            keyed.add(`${bone}.${channel}.${axis}`)
            let total = 0
            for (let i = 0; i < MEAN_SAMPLES; i++) {
              const t = length * i / MEAN_SAMPLES
              const at = channelAt(frames, t)
              if (!at) continue
              total += interpolate(at, axis, evaluate, { 'query.anim_time': t, this: self })
            }
            value = total / MEAN_SAMPLES
          } else {
            if (frames) keyed.add(`${bone}.${channel}.${axis}`)
            value = evaluate(values[axis], { this: self })
          }
          current[axis] = channel === 'scale' ? current[axis] * value : current[axis] + value
        }
      }
    }
  }
  return { pose, keyed }
}

export function computePose(description: any, sets: AnimationSets, skip?: string, globals: Record<string, number> = {}, rest?: Rest, overrides: Properties = {}): Record<string, Pose> {
  const still = poseAt(description, sets, 0, skip, globals, rest, overrides)
  const later = poseAt(description, sets, 0.73, skip, globals, rest, overrides)
  for (const [ bone, pose ] of Object.entries(still.pose)) {
    const other = later.pose[bone]
    for (const channel of CHANNELS) {
      for (let axis = 0; axis < 3; axis++) {
        if (still.keyed.has(`${bone}.${channel}.${axis}`)) continue
        if (Math.abs(pose[channel][axis] - (other?.[channel][axis] ?? NaN)) > 1e-6) pose[channel][axis] = channel === 'scale' ? 1 : 0
      }
    }
  }
  return still.pose
}

const SETTLED_QUERIES = { 'query.any_animation_finished': 1, 'query.all_animations_finished': 1 }

export function activatingProperties(description: any, sets: AnimationSets, animation: string, globals: Record<string, number> = {}): Properties {
  const defs = entityPropertyDefs(description, sets)
  const plays = (overrides: Properties, settled: boolean) => {
    const { evaluate, parser } = molangEvaluator(settled ? { ...globals, ...SETTLED_QUERIES } : globals, entityProperties(description, sets, overrides))
    runScripts(description, evaluate, parser)
    return activeAnimations(description, sets, evaluate).includes(animation)
  }
  for (const settled of [ true, false ]) {
    if (plays({}, settled)) return {}
    for (const [ name, def ] of Object.entries(defs)) {
      for (const value of def.values) {
        if (value === def.default) continue
        if (plays({ [name]: value }, settled)) return { [name]: value }
      }
    }
  }
  return {}
}
