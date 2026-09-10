import type { DeltaResult } from '@/delta_providers'
import { getThree, ModelLoader, prepareAssets } from '@/util/blockModelRenderer'
import { deltaVirtualHandler } from '@/util/virtualHandler'
import { imageFromBytes } from '@/util/imageFromBytes'
import { tgaToImageData } from '@/util/tga'
import { listFiles, parseJson } from '@/util/bedrockFiles'
import { activatingProperties, animationLength, computePose, entityProperties, hiddenBones, molangEvaluator, readAnimations, runScripts, sampleAnimation, visibleParts, type AnimationSets, type Pose, type Properties, type Rest } from '@/util/bedrockPose'

type Vec3 = [ number, number, number ]

type Cube = {
  origin?: Vec3
  size?: Vec3
  uv?: [ number, number ] | Record<string, { uv: [ number, number ], uv_size?: [ number, number ], uv_rotation?: number, material_instance?: string }>
  inflate?: number
  mirror?: boolean
  pivot?: Vec3
  rotation?: Vec3
}

type TextureMesh = {
  texture: string
  position?: Vec3
  rotation?: Vec3
  local_pivot?: Vec3
  scale?: Vec3
}

type Bone = {
  name: string
  parent?: string
  pivot?: Vec3
  rotation?: Vec3
  bind_pose_rotation?: Vec3
  mirror?: boolean
  inflate?: number
  neverRender?: boolean
  reset?: boolean
  cubes?: Cube[]
  texture_meshes?: TextureMesh[]
}

type Geometry = {
  id: string
  parent: string | null
  textureWidth: number | null
  textureHeight: number | null
  bones: Bone[]
}

type Sheet = {
  bone: string
  key: string
  mesh: TextureMesh
  width: number
  height: number
  mask: number[]
}

type Entry = {
  geometry: Geometry
  texture: string
  slots: Record<string, string>
  doubleSided: boolean
  pose: Record<string, Pose>
  hidden: string[]
  sheets: Sheet[]
}

type Block = {
  slots: Record<string, string>
  doubleSided: boolean
}

type VersionIndex = {
  geometries: Map<string, Geometry>
  files: Map<string, Geometry[]>
  textures: Map<string, string>
  names: Map<string, Record<string, string>>
  entities: Map<string, any>
  animations: AnimationSets
  owners: Map<string, any>
  controllers: Map<string, any>
  blocks: Map<string, Block>
  textureFiles: string[]
}

const indexes = new WeakMap<DeltaResult, Map<string, Promise<VersionIndex>>>()
const PREFERRED = /diamond/
const WALK_SPEED = 1
const WALK_DISTANCE_PER_SECOND = 14
const WALK_SCALES = [ 1, 0.8, 0.6, 0.45, 0.35, 0.25, 0.18, 0.12 ]
const MAX_SWING_HZ = 1.6
const SWING_SECONDS = 2
const SWING_FPS = 30
const KNOWN_TEXTURES: Record<string, string> = {
  'geometry.humanoid.customSlim': 'textures/entity/alex',
}
const assetsByVersion = new WeakMap<DeltaResult, Map<string, Promise<any>>>()

function readGeometries(json: any): Geometry[] {
  if (Array.isArray(json?.['minecraft:geometry'])) {
    return json['minecraft:geometry'].map((g: any) => ({
      id: String(g.description?.identifier ?? '').replace(/^minecraft:/, ''),
      parent: null,
      textureWidth: g.description?.texture_width ?? null,
      textureHeight: g.description?.texture_height ?? null,
      bones: g.bones ?? [],
    }))
  }
  const out: Geometry[] = []
  for (const [ key, g ] of Object.entries<any>(json ?? {})) {
    if (!key.startsWith('geometry.')) continue
    const [ id, parent ] = key.split(':')
    out.push({
      id,
      parent: parent ?? null,
      textureWidth: g.texturewidth ?? null,
      textureHeight: g.textureheight ?? null,
      bones: g.bones ?? [],
    })
  }
  return out
}

function controllerKeys(description: any, controllers: Map<string, any>, geometryName: string) {
  const named: string[] = []
  const arrays: string[] = []
  const plain: string[] = []
  for (const entry of description.render_controllers ?? []) {
    const name = typeof entry === 'string' ? entry : Object.keys(entry)[0]
    const controller = controllers.get(name)
    const ref = controller?.textures?.[0]
    if (typeof ref !== 'string') continue
    const keys: string[] = []
    for (const match of ref.matchAll(/Array\.(\w+)\s*\[/g)) {
      const first = controller.arrays?.textures?.[`Array.${match[1]}`]?.[0]
      const key = /Texture\.(\w+)/.exec(first ?? '')?.[1]
      if (key) keys.push(key)
    }
    const plainKeys = Array.from(ref.matchAll(/Texture\.(\w+)/g), (match: RegExpMatchArray) => match[1])
    const geometry = String(controller.geometry ?? '')
    const geometries = geometry.startsWith('Array.')
      ? controller.arrays?.geometries?.[geometry.replace(/\[.*$/, '')] ?? []
      : [ geometry ]
    if (geometries.includes(`Geometry.${geometryName}`)) named.push(...keys, ...plainKeys)
    arrays.push(...keys)
    plain.push(...plainKeys)
  }
  return { named, rest: arrays.concat(plain) }
}

function pickTexture(description: any, controllers: Map<string, any>, name: string, geometryId: string): string | null {
  const textures: Record<string, string> | undefined = description.textures
  if (!textures) return null
  const parts = geometryId.replace(/^geometry\./, '').replace(/[._]v\d.*$/, '').split('.')
  const baby = /baby/.test(name) || parts.includes('baby')
  const allowed = (key: string) => !/(^|_)none$/.test(key) && (baby || !/(^|_)baby(_|$)/.test(key))
  const keys = Object.keys(textures).filter(allowed)
  for (const key of [ name, `${name}_default` ]) if (textures[key]) return textures[key]
  const last = parts[parts.length - 1]
  const byName = keys.find(k => textures[k].split('/').pop() === last && (!baby || /baby/.test(k + textures[k])))
  if (byName) return textures[byName]
  const { named, rest } = controllerKeys(description, controllers, name)
  const fromControllers = rest.filter(allowed)
  const ordered = (baby ? [ ...fromControllers.filter(k => /baby/.test(k)), ...fromControllers ] : fromControllers).sort((a, b) => Number(/default/.test(b)) - Number(/default/.test(a)))
  const prefixed = keys.filter(k => name.startsWith(`${k}_`)).sort((a, b) => Number(PREFERRED.test(b)) - Number(PREFERRED.test(a)) || b.length - a.length)
  const variants = keys.filter(k => k.startsWith(`${name}_`) || k.endsWith(`_${name}`)).sort((a, b) => Number(PREFERRED.test(b)) - Number(PREFERRED.test(a)))
  for (const key of [ ...named.filter(allowed), ...prefixed, ...variants, ...baby ? [] : [ 'default', 'base' ], ...ordered ]) {
    if (textures[key]) return textures[key]
  }
  for (const key of [ 'default', 'base' ]) if (textures[key]) return textures[key]
  const sorted = [ ...keys ].sort()
  return sorted.length ? textures[sorted[0]] : null
}

async function buildIndex(dr: DeltaResult, version: string): Promise<VersionIndex> {
  const geometries = new Map<string, Geometry>()
  const files = new Map<string, Geometry[]>()
  for (const path of await listFiles(dr, version, 'resource_pack/models')) {
    if (!path.endsWith('.json')) continue
    try {
      const found = readGeometries(parseJson(await dr.getEntry(version, path)))
      files.set(path, found)
      for (const g of found) if (!geometries.has(g.id)) geometries.set(g.id, g)
    } catch {}
  }

  const controllers = new Map<string, any>()
  for (const path of await listFiles(dr, version, 'resource_pack/render_controllers')) {
    try {
      for (const [ name, controller ] of Object.entries(parseJson(await dr.getEntry(version, path)).render_controllers ?? {})) {
        controllers.set(name, controller)
      }
    } catch {}
  }

  const textures = new Map<string, string>()
  const names = new Map<string, Record<string, string>>()
  const entities = new Map<string, any>()
  const owners = new Map<string, any>()
  const ranks = new Map<string, number>()
  for (const [ dir, key ] of [ [ 'resource_pack/entity', 'minecraft:client_entity' ], [ 'resource_pack/attachables', 'minecraft:attachable' ] ]) {
    for (const path of await listFiles(dr, version, dir)) {
      try {
        const description = parseJson(await dr.getEntry(version, path))[key]?.description
        if (!description?.geometry) continue
        const owner = String(description.identifier ?? '').replace(/^minecraft:/, '')
        if (owner && !owners.has(owner)) owners.set(owner, description)
        for (const [ name, id ] of Object.entries<string>(description.geometry)) {
          const short = id.replace(/^geometry\./, '').replace(/\.v\d.*$/, '').split('.')[0]
          const rank = owner === short ? 3 : PREFERRED.test(owner) ? 2 : 1
          if (rank <= (ranks.get(id) ?? 0)) continue
          const texture = pickTexture(description, controllers, name, id)
          if (!texture) continue
          ranks.set(id, rank)
          textures.set(id, texture)
          if (description.textures) names.set(id, description.textures)
          entities.set(id, description)
        }
      } catch {}
    }
  }

  const blocks = await readBlocks(dr, version)
  const animations = await readAnimations(dr, version)

  const textureFiles = (await listFiles(dr, version, 'resource_pack/textures'))
    .filter(path => /\.(?:png|tga)$/.test(path) && !/_(?:mers|mer|normal|heightmap)\.(?:png|tga)$/.test(path))
    .map(path => path.slice('resource_pack/'.length).replace(/\.(?:png|tga)$/, ''))
    .sort()

  return { geometries, files, textures, names, entities, animations, owners, controllers, blocks, textureFiles }
}

function terrainPath(entry: any): string | null {
  const value = entry?.textures ?? entry
  if (Array.isArray(value)) return terrainPath(value[0])
  if (typeof value === 'string') return value
  if (value && typeof value.path === 'string') return value.path
  return null
}

async function readBlocks(dr: DeltaResult, version: string) {
  const blocks = new Map<string, Block>()
  let terrain: Record<string, any> = {}
  try {
    terrain = parseJson(await dr.getEntry(version, 'resource_pack/textures/terrain_texture.json')).texture_data ?? {}
  } catch {}
  const visit = (components: any) => {
    const geometry = components?.['minecraft:geometry']
    const id = typeof geometry === 'string' ? geometry : geometry?.identifier
    if (typeof id !== 'string') return
    const block = blocks.get(id.replace(/^minecraft:/, '')) ?? { slots: {}, doubleSided: false }
    for (const [ slot, instance ] of Object.entries<any>(components['minecraft:material_instances'] ?? {})) {
      const name = typeof instance === 'string' ? instance : instance?.texture
      const path = terrainPath(terrain[name])
      if (path && !block.slots[slot]) block.slots[slot] = path
      if (instance?.render_method === 'alpha_test' || instance?.render_method === 'blend') block.doubleSided = true
    }
    blocks.set(id.replace(/^minecraft:/, ''), block)
  }
  for (const path of await listFiles(dr, version, 'behavior_pack/blocks')) {
    if (!path.endsWith('.json')) continue
    try {
      const block = parseJson(await dr.getEntry(version, path))['minecraft:block']
      visit(block?.components)
      for (const permutation of block?.permutations ?? []) visit(permutation?.components)
    } catch {}
  }
  return blocks
}

function knownTexture(index: VersionIndex, geometryId: string): string | null {
  const known = KNOWN_TEXTURES[geometryId]
  return known && index.textureFiles.includes(known) ? known : null
}

function babyTexture(index: VersionIndex, geometryId: string): string | null {
  if (!/[._]baby([._]|$)/.test(geometryId)) return null
  const adult = geometryId.replace(/[._]baby(?=[._]|$)/, '')
  const texture = index.textures.get(adult) ?? knownTexture(index, adult) ?? childTexture(index, adult)
  if (!texture) return null
  const dir = texture.slice(0, texture.lastIndexOf('/') + 1)
  const siblings = index.textureFiles.filter(path => path.startsWith(dir) && /baby/.test(path.slice(dir.length)))
  return siblings.find(path => PREFERRED.test(path)) ?? siblings[0] ?? null
}

function childTexture(index: VersionIndex, geometryId: string): string | null {
  const pick = (children: Geometry[]) => {
    const textured = children.filter(child => index.textures.has(child.id))
    textured.sort((a, b) => a.id.split('.').length - b.id.split('.').length)
    return textured.length ? index.textures.get(textured[0].id)! : null
  }
  const all = Array.from(index.geometries.values())
  const named = pick(all.filter(child => child.id.startsWith(`${geometryId}.`)))
  if (named) return named
  let parents = [ geometryId ]
  while (parents.length) {
    const children = all.filter(child => parents.includes(child.parent!))
    const texture = pick(children)
    if (texture) return texture
    parents = children.map(child => child.id)
  }
  return null
}

function squash(name: string) {
  return name.replace(/[._]/g, '').toLowerCase()
}

function fallbackTexture(index: VersionIndex, geometryId: string, dirs = [ 'entity', 'items', 'blocks' ]) {
  const short = geometryId.replace(/^geometry\./, '').replace(/[._]v\d.*$/, '')
  const parts = short.split('.')
  const stems = [ short ]
  while (stems[stems.length - 1].includes('_')) stems.push(stems[stems.length - 1].replace(/_[^_]*$/, ''))
  for (const stem of stems) {
    for (const dir of dirs) {
      const candidate = `textures/${dir}/${stem}`
      if (index.textureFiles.includes(candidate)) return candidate
    }
  }
  for (const nested of [ `textures/entity/${parts[0]}/${parts.join('_')}`, `textures/entity/${parts[0]}/${parts[parts.length - 1]}` ]) {
    if (index.textureFiles.includes(nested)) return nested
  }
  const loose = index.textureFiles.find(path => /^textures\/(?:entity|items|blocks)\/[^/]+$/.test(path) && squash(path.split('/').pop()!) === squash(short))
  if (loose) return loose
  const owner = index.owners.get(parts[0]) ?? Array.from(index.owners.entries()).find(([ id ]) => squash(id) === squash(parts[0]))?.[1]
  if (owner) {
    const picked = pickTexture(owner, index.controllers, parts.includes('baby') ? 'baby' : 'default', geometryId)
    if (picked) return picked
  }
  for (const candidate of [ `textures/entity/${parts[0]}/`, `textures/items/${parts[0]}/` ]) {
    const matches = index.textureFiles.filter(path => path.startsWith(candidate))
    if (matches.length) return matches.find(path => PREFERRED.test(path)) ?? matches[0]
  }
  return null
}

function versionIndex(dr: DeltaResult, version: string) {
  let versions = indexes.get(dr)
  if (!versions) indexes.set(dr, versions = new Map())
  let pending = versions.get(version)
  if (!pending) versions.set(version, pending = buildIndex(dr, version))
  return pending
}

function resolveGeometry(index: VersionIndex, geometry: Geometry, seen = new Set<string>()): Geometry {
  if (!geometry.parent || seen.has(geometry.parent)) return geometry
  const parent = index.geometries.get(geometry.parent)
  if (!parent) return geometry
  seen.add(geometry.parent)
  const base = resolveGeometry(index, parent, seen)
  const bones = base.bones.map(bone => ({ ...bone }))
  for (const bone of geometry.bones) {
    const i = bones.findIndex(b => b.name === bone.name)
    if (i === -1) bones.push(bone)
    else bones[i] = bone.reset ? bone : { ...bones[i], ...bone }
  }
  return {
    ...geometry,
    textureWidth: geometry.textureWidth ?? base.textureWidth,
    textureHeight: geometry.textureHeight ?? base.textureHeight,
    bones,
  }
}

async function readTexture(dr: DeltaResult, version: string, texture: string): Promise<ImageBitmap | null> {
  for (const ext of [ '.png', '.tga' ]) {
    try {
      return await imageFromBytes(await dr.getEntry(version, `resource_pack/${texture}${ext}`))
    } catch {}
  }
  return null
}

function alphaMask(image: ImageBitmap) {
  const canvas = new OffscreenCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, 0, 0)
  const data = ctx.getImageData(0, 0, image.width, image.height).data
  const mask: number[] = []
  for (let i = 3; i < data.length; i += 4) mask.push(data[i] > 140 ? 1 : 0)
  return mask
}

function meshTexturePath(index: VersionIndex, geometryId: string, texture: string) {
  const names = index.names.get(geometryId)
  if (names?.[texture]) return names[texture]
  const match = Object.values(names ?? {}).find(path => path.split('/').pop() === texture)
  if (match) return match
  return index.textureFiles.find(path => path.split('/').pop() === texture) ?? fallbackTexture(index, geometryId)
}

async function texturePixels(dr: DeltaResult, version: string, texture: string): Promise<ImageData | null> {
  for (const ext of [ '.png', '.tga' ]) {
    let bytes: Uint8Array<ArrayBuffer>
    try {
      bytes = await dr.getEntry(version, `resource_pack/${texture}${ext}`)
    } catch {
      continue
    }
    try {
      if (ext === '.tga') return tgaToImageData(bytes)
      const image = await imageFromBytes(bytes)
      const canvas = new OffscreenCanvas(image.width, image.height)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(image, 0, 0)
      return ctx.getImageData(0, 0, image.width, image.height)
    } catch {}
  }
  return null
}

async function blankTexture(dr: DeltaResult, version: string, texture: string) {
  const pixels = await texturePixels(dr, version, texture)
  if (!pixels) return true
  for (let i = 3; i < pixels.data.length; i += 4) if (pixels.data[i]) return false
  return true
}

async function texturePng(dr: DeltaResult, version: string, texture: string): Promise<Uint8Array | null> {
  const pixels = await texturePixels(dr, version, texture)
  if (!pixels) return null
  const data = pixels.data
  for (let i = 3; i < data.length; i += 4) if (data[i]) data[i] = 255
  const canvas = new OffscreenCanvas(pixels.width, pixels.height)
  canvas.getContext('2d')!.putImageData(pixels, 0, 0)
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
}

function bedrockHandler(dr: DeltaResult, version: string) {
  const base = deltaVirtualHandler(dr, version)
  return {
    async read(path: string) {
      const match = /^assets\/minecraft\/textures\/mcbe\/(.+)\.png$/.exec(path)
      return match ? texturePng(dr, version, match[1]) : base.read(path)
    },
    list: base.list,
  }
}

function versionAssets(dr: DeltaResult, version: string) {
  let versions = assetsByVersion.get(dr)
  if (!versions) assetsByVersion.set(dr, versions = new Map())
  let pending = versions.get(version)
  if (!pending) versions.set(version, pending = prepareAssets(bedrockHandler(dr, version), { cache: true, translucency: { min: 255, max: 255 } }))
  return pending
}

async function sizedTexture(dr: DeltaResult, version: string, index: VersionIndex, geometry: Geometry, texture: string) {
  if (geometry.textureWidth === null || geometry.textureHeight === null) return texture
  const ratio = geometry.textureWidth / geometry.textureHeight
  const fits = (image: ImageBitmap | null) => !!image && Math.abs(image.width / image.height - ratio) < 1e-6
  const exact = (image: ImageBitmap | null) => !!image && image.width === geometry.textureWidth && image.height === geometry.textureHeight
  const own = await readTexture(dr, version, texture)
  if (exact(own)) return texture
  const dir = texture.slice(0, texture.lastIndexOf('/') + 1)
  const parts = geometry.id.replace(/^geometry\./, '').replace(/[._]v\d.*$/, '').split('.')
  const picked = texture.split('/').pop()!
  const related = (path: string) => {
    const name = path.split('/').pop()!
    return (parts.includes(name) ? 2 : 0) + (picked.includes(name) || name.includes(picked) ? 1 : 0)
  }
  const score = (path: string) => related(path) * 2 + (PREFERRED.test(path.split('/').pop()!) ? 1 : 0)
  const candidates = index.textureFiles
    .filter(path => path.startsWith(dir) && path !== texture && !path.slice(dir.length).includes('/'))
    .sort((a, b) => score(b) - score(a))
  for (const candidate of candidates.filter(path => related(path) > 0)) if (exact(await readTexture(dr, version, candidate))) return candidate
  if (fits(own)) return texture
  for (const candidate of candidates) if (exact(await readTexture(dr, version, candidate))) return candidate
  for (const candidate of candidates) if (fits(await readTexture(dr, version, candidate))) return candidate
  return null
}

function restOf(geometry: Geometry): Rest {
  const rest: Rest = {}
  for (const bone of geometry.bones) {
    const [ x, y, z ] = bone.pivot ?? [ 0, 0, 0 ]
    rest[bone.name.toLowerCase()] = { rotation: bone.rotation ?? [ 0, 0, 0 ], position: [ x, y - 24, z ] }
  }
  return rest
}

function babyGlobals(...names: (string | undefined)[]): Record<string, number> {
  return names.some(name => name && /(^|[._])baby([._]|$)/i.test(name)) ? { 'query.is_baby': 1 } : {}
}

async function loadEntry(dr: DeltaResult, version: string, index: VersionIndex, file: string, found: Geometry, key: string, skipAnimation?: string, overrides: Properties = {}): Promise<{ entry: Entry, textures: Record<string, string> }> {
  const geometry = resolveGeometry(index, found)
  const isBlock = file.includes('/blocks/') || index.blocks.has(geometry.id)
  const block = index.blocks.get(geometry.id)?.slots ?? {}
  const slots: Record<string, string> = {}
  const textures: Record<string, string> = {}
  for (const [ slot, path ] of Object.entries(block)) {
    slots[slot] = `${key}_${slot}`
    textures[slots[slot]] = `mcbe/${path}`
  }
  let texture: string | null = block['*'] ?? Object.values(block)[0] ?? index.textures.get(geometry.id) ?? knownTexture(index, geometry.id) ?? childTexture(index, geometry.id) ?? babyTexture(index, geometry.id)
  if (texture && await blankTexture(dr, version, texture)) texture = null
  if (!texture) {
    texture = fallbackTexture(index, geometry.id, isBlock ? [ 'blocks', 'entity', 'items' ] : undefined)
    if (texture) texture = await sizedTexture(dr, version, index, geometry, texture)
    if (texture && await blankTexture(dr, version, texture)) texture = null
  }
  if (texture && (geometry.textureWidth === null || geometry.textureHeight === null)) {
    const image = await readTexture(dr, version, texture)
    if (image) {
      geometry.textureWidth ??= image.width
      geometry.textureHeight ??= image.height
    }
  }

  textures[key] = `mcbe/${texture ?? 'missing'}`
  const sheets: Sheet[] = []
  for (const bone of geometry.bones) {
    for (const mesh of bone.texture_meshes ?? []) {
      const sheetPath = meshTexturePath(index, geometry.id, mesh.texture)
      const sheetImage = sheetPath ? await readTexture(dr, version, sheetPath) : null
      if (!sheetImage) continue
      const sheetKey = `${key}s${sheets.length}`
      textures[sheetKey] = `mcbe/${sheetPath}`
      sheets.push({ bone: bone.name, key: sheetKey, mesh, width: sheetImage.width, height: sheetImage.height, mask: alphaMask(sheetImage) })
    }
  }
  const doubleSided = isBlock ? index.blocks.get(geometry.id)?.doubleSided ?? false : true
  const entity = index.entities.get(geometry.id)
  const geometryName = entity ? Object.entries<string>(entity.geometry ?? {}).find(([ , id ]) => id.replace(/^minecraft:/, '') === geometry.id)?.[0] : undefined
  const globals = babyGlobals(geometryName, geometry.id)
  const pose = entity ? computePose(entity, index.animations, skipAnimation, globals, restOf(geometry), overrides) : {}
  const hidden = entity && geometryName ? Array.from(hiddenBones(entity, index.controllers, geometryName, geometry.bones.map(bone => bone.name), index.animations, globals, overrides)) : []
  return { entry: { geometry, texture: key, slots, doubleSided, pose, hidden, sheets }, textures }
}

export async function listBedrockModels(dr: DeltaResult, version: string, path: string) {
  const index = await versionIndex(dr, version)
  return (index.files.get(path) ?? []).map(g => ({ id: g.id, name: g.id.replace(/^geometry\./, ''), key: JSON.stringify(g) }))
}

export async function listBedrockAnimations(dr: DeltaResult, version: string, path: string) {
  const index = await versionIndex(dr, version)
  return (index.animations.files.get(path) ?? []).map(id => ({ id, name: id.replace(/^animation\./, ''), key: JSON.stringify(index.animations.animations.get(id)) }))
}

export async function loadBedrockAnimation(dr: DeltaResult, version: string, path: string, id?: string) {
  const index = await versionIndex(dr, version)
  const name = id ?? index.animations.files.get(path)?.[0]
  const animation = name ? index.animations.animations.get(name) : null
  if (!animation) throw new Error('No animation in this file')
  const owner = path.split('/').pop()!.split('.')[0]
  const owners = Array.from(index.owners.entries())
  const using = (ids: string[]) => owners.filter(([ , description ]) => Object.values<string>(description.animations ?? {}).some(id => ids.includes(id)))
  const preferOwner = (candidates: [ string, any ][]) => candidates.find(([ identifier ]) => squash(identifier) === squash(owner)) ?? candidates[0]
  const description = (
    preferOwner(using([ name! ]))
    ?? preferOwner(using(index.animations.files.get(path) ?? []))
    ?? owners.find(([ identifier ]) => squash(identifier) === squash(owner))
    ?? owners.find(([ identifier ]) => identifier === 'player')
  )?.[1]
  if (!description) throw new Error('No entity uses this animation')
  const baby = /baby/i.test(name!)
  const geometryId = String((baby ? description.geometry.baby : undefined) ?? description.geometry.default ?? Object.values<string>(description.geometry)[0] ?? '').replace(/^minecraft:/, '')
  const file = Array.from(index.files.entries()).find(([ , geometries ]) => geometries.some(g => g.id === geometryId))
  const geometry = file?.[1].find(g => g.id === geometryId)
  if (!file || !geometry) throw new Error(`Missing geometry ${geometryId}`)
  const globals = babyGlobals(name)
  const overrides = activatingProperties(description, index.animations, name!, globals)
  const loaded = await loadEntry(dr, version, index, file[0], geometry, 'm0', name, overrides)
  const rest = restOf(loaded.entry.geometry)
  const geometryName = Object.entries<string>(description.geometry ?? {}).find(([ , id ]) => id.replace(/^minecraft:/, '') === geometryId)?.[0]
  const boneNames = loaded.entry.geometry.bones.map(bone => bone.name)

  const stepper = (scale: number) => {
    const { evaluate, parser } = molangEvaluator(globals, entityProperties(description, index.animations, overrides))
    let lastTime = 0
    let animTime = 0
    const step = (time: number) => {
      const delta = Math.max(0, Math.min(time - lastTime, 0.1))
      lastTime = time
      Object.assign(parser.global_variables, {
        'query.life_time': time,
        'query.delta_time': delta,
        'query.modified_distance_moved': time * WALK_DISTANCE_PER_SECOND * scale,
        'query.modified_move_speed': WALK_SPEED * scale,
        'query.ground_speed': WALK_SPEED * scale,
        'query.is_moving': 1,
        'query.is_on_ground': 1,
      })
      animTime = animation.anim_time_update ? evaluate(animation.anim_time_update, { 'query.anim_time': animTime }) : time
      parser.global_variables['query.anim_time'] = animTime
      runScripts(description, evaluate, parser)
      return sampleAnimation(animation, time, evaluate, animTime, loaded.entry.pose, rest)
    }
    return { step, evaluate }
  }

  const usesSpeed = /modified_move_speed|ground_speed|modified_distance_moved|anim_time_update|delta_time/.test(JSON.stringify(animation) + JSON.stringify(description.scripts ?? {}))
  let scale = 1
  if (usesSpeed) {
    for (const candidate of WALK_SCALES) {
      scale = candidate
      if (swingRate(stepper(candidate).step) <= MAX_SWING_HZ) break
    }
  }

  const { step, evaluate } = stepper(scale)
  const THREE = await getThree()
  let bones: Map<string, any> | null = null
  const animate = (group: any, time: number) => {
    if (!bones) group.traverse((object: any) => { if (object.userData.mcbeBones) bones = object.userData.mcbeBones })
    if (!bones) return
    const sample = step(time)
    const hidden = geometryName ? visibleParts(evaluate, description, index.controllers, geometryName, boneNames) : new Set<string>()
    for (const [ boneName, g ] of bones) {
      const base = g.userData.mcbeBase
      if (g.userData.mcbeParts) g.userData.mcbeParts.visible = !hidden.has(boneName.toLowerCase())
      const transform = sample[boneName.toLowerCase()]
      if (!base || !transform) continue
      g.rotation.copy(rotationOf([ 0, 1, 2 ].map(i => base.rotation[i] + transform.rotation[i]) as Vec3, THREE))
      g.position.set(base.position.x - transform.position[0], base.position.y + transform.position[1], base.position.z + transform.position[2])
      g.scale.set(...transform.scale)
    }
  }

  return {
    assets: await versionAssets(dr, version),
    model: {
      double_sided: loaded.entry.doubleSided,
      textures: loaded.textures,
      'mcbe:model': loaded.entry,
    },
    animate,
    length: animationLength(animation),
  }
}

function swingRate(step: (time: number) => Record<string, Pose>): number {
  const frames = SWING_SECONDS * SWING_FPS
  const history = new Map<string, number[]>()
  for (let i = 0; i <= frames; i++) {
    const sample = step(i / SWING_FPS)
    for (const [ bone, transform ] of Object.entries(sample)) {
      for (let axis = 0; axis < 3; axis++) {
        const key = `${bone}.${axis}`
        let values = history.get(key)
        if (!values) history.set(key, values = [])
        values.push(transform.rotation[axis])
      }
    }
  }
  let peak = 0
  for (const values of history.values()) {
    let turns = 0
    let direction = 0
    let low = Infinity
    let high = -Infinity
    for (let i = 1; i < values.length; i++) {
      low = Math.min(low, values[i])
      high = Math.max(high, values[i])
      const change = values[i] - values[i - 1]
      if (Math.abs(change) < 0.25) continue
      const next = Math.sign(change)
      if (direction && next !== direction) turns++
      direction = next
    }
    if (high - low < 5) continue
    peak = Math.max(peak, turns / 2 / SWING_SECONDS)
  }
  return peak
}

export async function loadBedrockModel(dr: DeltaResult, version: string, path: string, id?: string) {
  const index = await versionIndex(dr, version)
  const found = index.files.get(path) ?? []
  const geometry = id ? found.find(g => g.id === id) : found[0]
  if (!geometry) throw new Error('No geometry in this file')
  const loaded = await loadEntry(dr, version, index, path, geometry, 'm0')

  return {
    assets: await versionAssets(dr, version),
    model: {
      double_sided: loaded.entry.doubleSided,
      textures: loaded.textures,
      'mcbe:model': loaded.entry,
    },
  }
}

type Face = { uv: [ number, number, number, number ], texture: string, rotation?: number }
type Element = { from: Vec3, to: Vec3, faces: Partial<Record<string, Face>> }

const FACE_SIZES: Record<string, (w: number, h: number, d: number) => [ number, number ]> = {
  north: (w, h) => [ w, h ],
  south: (w, h) => [ w, h ],
  east: (_w, h, d) => [ d, h ],
  west: (_w, h, d) => [ d, h ],
  up: (w, _h, d) => [ w, d ],
  down: (w, _h, d) => [ w, d ],
}

function cubeFaces(cube: Cube, mirror: boolean): Record<string, [ number, number, number, number ]> {
  const size = cube.size ?? [ 0, 0, 0 ]
  let faces: Record<string, [ number, number, number, number ]>
  if (Array.isArray(cube.uv) || !cube.uv) {
    const [ u, v ] = cube.uv ?? [ 0, 0 ]
    const [ w, h, d ] = size.map(n => Math.floor(n + 1e-6))
    faces = {
      east: [ u, v + d, u + d, v + d + h ],
      north: [ u + d, v + d, u + d + w, v + d + h ],
      west: [ u + d + w, v + d, u + 2 * d + w, v + d + h ],
      south: [ u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h ],
      up: [ u + d + w, v + d, u + d, v ],
      down: [ u + d + 2 * w, v, u + d + w, v + d ],
    }
  } else {
    const [ w, h, d ] = size
    faces = {}
    for (const [ name, face ] of Object.entries(cube.uv)) {
      if (!face?.uv || !FACE_SIZES[name]) continue
      const [ fw, fh ] = face.uv_size ?? FACE_SIZES[name](w, h, d)
      faces[name] = name === 'up' || name === 'down'
        ? [ face.uv[0] + fw, face.uv[1] + fh, face.uv[0], face.uv[1] ]
        : [ face.uv[0], face.uv[1], face.uv[0] + fw, face.uv[1] + fh ]
    }
  }
  if (mirror) {
    const flipped: Record<string, [ number, number, number, number ]> = {}
    for (const [ name, [ x1, y1, x2, y2 ] ] of Object.entries(faces)) {
      flipped[name === 'east' ? 'west' : name === 'west' ? 'east' : name] = [ x2, y1, x1, y2 ]
    }
    faces = flipped
  }
  return faces
}

function scaledFaces(faces: Record<string, [ number, number, number, number ]>, texture: (name: string) => string, textureWidth: number, textureHeight: number, rotations: Record<string, number> = {}) {
  const out: Partial<Record<string, Face>> = {}
  for (const [ name, [ x1, y1, x2, y2 ] ] of Object.entries(faces)) {
    out[name] = {
      uv: [ x1 * 16 / textureWidth, y1 * 16 / textureHeight, x2 * 16 / textureWidth, y2 * 16 / textureHeight ],
      texture: texture(name),
      ...rotations[name] ? { rotation: rotations[name] } : {},
    }
  }
  return out
}

function faceProps<T>(cube: Cube, mirror: boolean, pick: (face: { uv_rotation?: number, material_instance?: string }) => T | undefined): Record<string, T> {
  const out: Record<string, T> = {}
  if (Array.isArray(cube.uv) || !cube.uv) return out
  for (const [ name, face ] of Object.entries(cube.uv)) {
    const value = face && pick(face)
    if (value === undefined) continue
    out[mirror && name === 'east' ? 'west' : mirror && name === 'west' ? 'east' : name] = value
  }
  return out
}

function cubeElement(cube: Cube, bone: Bone, entry: Entry, textureWidth: number, textureHeight: number): Element {
  const [ ox, oy, oz ] = cube.origin ?? [ 0, 0, 0 ]
  const [ w, h, d ] = cube.size ?? [ 0, 0, 0 ]
  const inflate = cube.inflate ?? bone.inflate ?? 0
  const mirror = cube.mirror ?? bone.mirror ?? false
  const materials = faceProps(cube, mirror, face => face.material_instance)
  const rotations = faceProps(cube, mirror, face => face.uv_rotation)
  return {
    from: [ -(ox + w) - inflate, oy - inflate, oz - inflate ],
    to: [ -ox + inflate, oy + h + inflate, oz + d + inflate ],
    faces: scaledFaces(cubeFaces(cube, mirror), name => `#${entry.slots[materials[name] ?? '*'] ?? entry.texture}`, textureWidth, textureHeight, rotations),
  }
}

function sheetElements(sheet: Sheet, textureWidth: number, textureHeight: number): Element[] {
  const { width, height, mask, mesh } = sheet
  const [ sx, sy, sz ] = mesh.scale ?? [ 1, 1, 1 ]
  const [ px, py, pz ] = mesh.local_pivot ?? [ 0, 0, 0 ]
  const ux = textureWidth / width
  const uz = textureHeight / height
  const elements: Element[] = []
  for (let y = 0; y < height; y++) {
    let x = 0
    while (x < width) {
      if (!mask[y * width + x]) {
        x++
        continue
      }
      const start = x
      while (x < width && mask[y * width + x]) x++
      const end = x
      elements.push({
        from: [ -end * ux * sx + px, -sy + py, y * uz * sz - pz ],
        to: [ -start * ux * sx + px, py, (y + 1) * uz * sz - pz ],
        faces: scaledFaces({
          up: [ end, y, start, y + 1 ],
          down: [ end, y + 1, start, y ],
          north: [ start, y, end, y + 1 ],
          south: [ end, y, start, y + 1 ],
          east: [ start, y, start + 1, y + 1 ],
          west: [ end - 1, y, end, y + 1 ],
        }, () => `#${sheet.key}`, width, height),
      })
    }
  }
  return elements
}

function pivotOf(pivot: Vec3 | undefined, THREE: any) {
  const [ x, y, z ] = pivot ?? [ 0, 0, 0 ]
  return new THREE.Vector3(-x, y, z)
}

function rotationOf(rotation: Vec3 | undefined, THREE: any) {
  const [ x, y, z ] = rotation ?? [ 0, 0, 0 ]
  return new THREE.Euler(THREE.MathUtils.degToRad(-x), THREE.MathUtils.degToRad(-y), THREE.MathUtils.degToRad(z), 'ZYX')
}

async function buildEntry(group: any, entry: Entry, helpers: any) {
  const THREE = helpers.THREE
  const { geometry, sheets } = entry
  const textureWidth = geometry.textureWidth ?? 64
  const textureHeight = geometry.textureHeight ?? 32

  const groups = new Map<string, any>()
  for (const bone of geometry.bones) {
    const g = new THREE.Group()
    const pose = entry.pose[bone.name.toLowerCase()]
    const rotation = bone.rotation ?? [ 0, 0, 0 ]
    const posed = pose ? [ 0, 1, 2 ].map(i => rotation[i] + pose.rotation[i]) as Vec3 : rotation
    g.rotation.copy(rotationOf(posed, THREE))
    if (pose) g.scale.set(...pose.scale)
    g.userData.mcbeBase = { rotation }
    groups.set(bone.name, g)
  }
  group.userData.mcbeBones = groups

  async function place(parent: any, elements: Element[], position: any, rotation?: any) {
    const built = await helpers.buildElements(elements)
    built.position.copy(position).negate().addScalar(8)
    if (!rotation) {
      parent.add(built)
      return
    }
    const holder = new THREE.Group()
    holder.position.copy(position)
    holder.rotation.copy(rotation)
    holder.add(built)
    parent.add(holder)
  }

  for (const bone of geometry.bones) {
    const g = groups.get(bone.name)
    const pivot = pivotOf(bone.pivot, THREE)
    const parent = bone.parent ? groups.get(bone.parent) : null
    const parentBone = bone.parent ? geometry.bones.find(b => b.name === bone.parent) : null
    if (parent) {
      g.position.copy(pivot).sub(pivotOf(parentBone?.pivot, THREE))
      parent.add(g)
    } else {
      g.position.copy(pivot)
      group.add(g)
    }
    g.userData.mcbeBase.position = g.position.clone()
    const pose = entry.pose[bone.name.toLowerCase()]
    if (pose) g.position.add(new THREE.Vector3(-pose.position[0], pose.position[1], pose.position[2]))

    if (bone.neverRender) continue

    let own = g
    if (bone.bind_pose_rotation) {
      own = new THREE.Group()
      own.rotation.copy(rotationOf(bone.bind_pose_rotation, THREE))
      g.add(own)
    }
    const parts = new THREE.Group()
    parts.visible = !entry.hidden.includes(bone.name.toLowerCase())
    own.add(parts)
    g.userData.mcbeParts = parts

    const plain: Element[] = []
    for (const cube of bone.cubes ?? []) {
      const element = cubeElement(cube, bone, entry, textureWidth, textureHeight)
      if (!cube.rotation) {
        plain.push(element)
        continue
      }
      const local = new THREE.Group()
      local.position.copy(pivotOf(cube.pivot, THREE)).sub(pivot)
      local.rotation.copy(rotationOf(cube.rotation, THREE))
      parts.add(local)
      await place(local, [ element ], pivotOf(cube.pivot, THREE))
    }
    if (plain.length) await place(parts, plain, pivot)

    for (const sheet of sheets) {
      if (sheet.bone !== bone.name) continue
      const [ mx, my, mz ] = sheet.mesh.position ?? [ 0, 0, 0 ]
      const local = new THREE.Group()
      local.position.set(-mx - pivot.x, -my, mz - pivot.z)
      local.rotation.copy(rotationOf(sheet.mesh.rotation, THREE))
      parts.add(local)
      const built = await helpers.buildElements(sheetElements(sheet, textureWidth, textureHeight))
      built.position.set(-8, -8, -8).negate()
      local.add(built)
    }
  }
}

export function registerBedrockLoader() {
  if (ModelLoader.list().some((loader: any) => loader.name === 'mcbe')) return
  ModelLoader.register({
    name: 'mcbe',
    priority: 10,
    replaceElements: true,
    mergeKey(key: string, values: unknown[]) {
      if (key === 'mcbe:model') return values[0]
    },
    match(model: any) {
      return !!model['mcbe:model']
    },
    build({ group, model, helpers }: any) {
      return buildEntry(group, model['mcbe:model'], helpers)
    },
  })
}
