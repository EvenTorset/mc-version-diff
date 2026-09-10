import type { DeltaResult } from '@/delta_providers'
import { listFiles, parseJson } from '@/util/bedrockFiles'
import { imageFromBytes } from '@/util/imageFromBytes'
import { loadBedrockFont, LINE, type BitmapFont } from '@/util/bedrockFont'

export const SCREEN_WIDTH = 376
export const SCREEN_HEIGHT = 250
export const UI_SCALE = 4
const MAX_NODES = 6000
const MAX_DEPTH = 40
const FONT_SCALES: Record<string, number> = { small: 0.75, normal: 1, medium: 1.25, large: 1.5, extra_large: 2 }
const SHOWN_BINDINGS = new Set<string>([])
const IGNORED_BINDINGS = new Set<string>([ '#is_container_screen' ])
const DEVICE_VARIABLES: Record<string, any> = {
  '$desktop_screen': true,
  '$is_desktop': true,
  '$container_title': '',
  '$pocket_screen': false,
  '$win10_edition': true,
  '$pocket_edition': false,
  '$education_edition': false,
  '$default_state': true,
  '$hover_state': false,
  '$pressed_state': false,
  '$locked_state': false,
  '$toggle_unchecked': true,
  '$toggle_checked': false,
  '$toggle_unchecked_hover': false,
  '$toggle_checked_hover': false,
  '$top_vertical_safezone_size': [ '100%', 0 ],
  '$bottom_vertical_safezone_size': [ '100%', 0 ],
  '$left_horizontal_safezone_size': [ 0, '100%' ],
  '$right_horizontal_safezone_size': [ 0, '100%' ],
}

type Def = { base: string | null, props: Record<string, any> }
type Namespace = Map<string, Def>
type Vars = Record<string, any>

export type UiIndex = {
  namespaces: Map<string, Namespace>
  files: Map<string, { namespace: string, names: string[] }>
  globals: Vars
  lang: Map<string, string>
  textures: Set<string>
}

type Node = {
  name: string
  type: string
  props: Record<string, any>
  vars: Vars
  children: Node[]
  x: number
  y: number
  w: number
  h: number
  visible: boolean
  measured: Map<string, Measured>
}

type Rect = { x: number, y: number, w: number, h: number }
type Anchor = [ number, number ]

const ANCHORS: Record<string, Anchor> = {
  top_left: [ 0, 0 ], top_middle: [ 0.5, 0 ], top_right: [ 1, 0 ],
  left_middle: [ 0, 0.5 ], center: [ 0.5, 0.5 ], right_middle: [ 1, 0.5 ],
  bottom_left: [ 0, 1 ], bottom_middle: [ 0.5, 1 ], bottom_right: [ 1, 1 ],
}

const indexes = new WeakMap<DeltaResult, Map<string, Promise<UiIndex>>>()

export function uiIndex(dr: DeltaResult, version: string): Promise<UiIndex> {
  let cache = indexes.get(dr)
  if (!cache) indexes.set(dr, cache = new Map())
  let pending = cache.get(version)
  if (!pending) cache.set(version, pending = buildIndex(dr, version))
  return pending
}

async function buildIndex(dr: DeltaResult, version: string): Promise<UiIndex> {
  const namespaces = new Map<string, Namespace>()
  const files = new Map<string, { namespace: string, names: string[] }>()
  let globals: Vars = {}
  const paths = (await listFiles(dr, version, 'resource_pack/ui')).filter(path => path.endsWith('.json'))
  for (const path of paths) {
    let json: any
    try {
      json = parseJson(await dr.getEntry(version, path))
    } catch {
      continue
    }
    if (!json || typeof json !== 'object') continue
    if (path.endsWith('/_global_variables.json')) {
      globals = json
      continue
    }
    if (typeof json.namespace !== 'string') continue
    const namespace = json.namespace
    let ns = namespaces.get(namespace)
    if (!ns) namespaces.set(namespace, ns = new Map())
    const names: string[] = []
    for (const [ key, value ] of Object.entries<any>(json)) {
      if (key === 'namespace' || !value || typeof value !== 'object' || Array.isArray(value)) continue
      const [ name, base ] = key.split('@')
      ns.set(name, { base: base ?? null, props: value })
      names.push(name)
    }
    files.set(path, { namespace, names })
  }
  const lang = new Map<string, string>()
  try {
    const text = new TextDecoder().decode(await dr.getEntry(version, 'resource_pack/texts/en_US.lang'))
    for (const line of text.split(/\r?\n/)) {
      const eq = line.indexOf('=')
      if (eq <= 0 || line.startsWith('#')) continue
      lang.set(line.slice(0, eq).trim(), line.slice(eq + 1).replace(/\t#.*$/, '').trim())
    }
  } catch {}
  const textures = new Set((await listFiles(dr, version, 'resource_pack/textures')))
  return { namespaces, files, globals, lang, textures }
}

export async function listBedrockUiControls(dr: DeltaResult, version: string, path: string) {
  const index = await uiIndex(dr, version)
  const file = index.files.get(path)
  if (!file) return []
  const ns = index.namespaces.get(file.namespace)!
  const screens = file.names.filter(name => resolvedType(index, file.namespace, name) === 'screen')
  const references = new Map<string, Set<string>>()
  for (const name of file.names) {
    const refs = new Set<string>()
    const note = (ref: string) => {
      const [ refNs, refName ] = splitRef(ref.replace(/^@/, ''), file.namespace)
      if (refNs === file.namespace && refName !== name) refs.add(refName)
    }
    const scan = (value: any) => {
      if (typeof value === 'string') {
        if (/^@?[\w-]+\.[\w-]+$/.test(value)) note(value)
      } else if (Array.isArray(value)) value.forEach(scan)
      else if (value && typeof value === 'object') {
        for (const [ key, child ] of Object.entries(value)) {
          const at = key.indexOf('@')
          if (at !== -1) note(key.slice(at + 1))
          scan(child)
        }
      }
    }
    const def = ns.get(name)!
    if (def.base) note(def.base)
    scan(def.props)
    references.set(name, refs)
  }
  const referenced = new Set(Array.from(references.values()).flatMap(refs => Array.from(refs)))
  const roots = file.names.filter(name => !referenced.has(name) && !/^(screen_|.*_(animation|anim)s?$)/.test(name))
  const names = screens.length ? screens : roots.length ? roots : file.names
  const closure = (name: string) => {
    const seen = new Set<string>()
    const visit = (current: string) => {
      if (seen.has(current) || !ns.has(current)) return
      seen.add(current)
      references.get(current)?.forEach(visit)
    }
    visit(name)
    return Array.from(seen).sort().map(current => [ current, ns.get(current) ])
  }
  return names.map(name => ({ id: name, name, key: JSON.stringify(closure(name)) }))
}

function splitRef(ref: string, ns: string): [ string, string ] {
  const dot = ref.indexOf('.')
  return dot === -1 ? [ ns, ref ] : [ ref.slice(0, dot), ref.slice(dot + 1) ]
}

function chain(index: UiIndex, ns: string, name: string, seen = new Set<string>()): { ns: string, def: Def }[] {
  const key = `${ns}.${name}`
  if (seen.has(key)) return []
  seen.add(key)
  const def = index.namespaces.get(ns)?.get(name)
  if (!def) return []
  const own = { ns, def }
  if (!def.base || def.base.startsWith('$')) return [ own ]
  const [ baseNs, baseName ] = splitRef(def.base, ns)
  return chain(index, baseNs, baseName, seen).concat([ own ])
}

function resolvedType(index: UiIndex, ns: string, name: string): string | undefined {
  const levels = chain(index, ns, name)
  for (let i = levels.length - 1; i >= 0; i--) {
    const type = levels[i].def.props.type
    if (typeof type === 'string') return type
  }
  return undefined
}

const EXPLICIT = '__explicit'

function applyLevel(props: Record<string, any>, vars: Vars, merged: Record<string, any>) {
  const explicit: Set<string> = vars[EXPLICIT]
  for (const [ key, value ] of Object.entries(props)) {
    if (key.startsWith('$')) {
      const bar = key.indexOf('|')
      if (bar !== -1) {
        const name = key.slice(0, bar)
        if (!explicit.has(name)) vars[name] = value
      } else {
        vars[key] = value
        explicit.add(key)
      }
    } else if (key === 'controls') merged.controls = Array.isArray(value) ? value : merged.controls
    else if (key === 'variables') merged.variables = (merged.variables ?? []).concat(Array.isArray(value) ? value : [ value ])
    else merged[key] = value
  }
}

function guessVariable(name: string): any {
  if (/_index$/.test(name)) return 0
  if (/^\$(ignore_|supports_|show_)|_(visible|ignored)$/.test(name)) return true
  if (/^\$(is_|hide_|use_)|_(disabled|hidden)$/.test(name)) return false
  if (/_(supported|enabled)$/.test(name)) return true
  return undefined
}

function lookup(vars: Vars, name: string, depth = 0): any {
  const bar = name.indexOf('|')
  const key = bar === -1 ? name : name.slice(0, bar)
  let value = vars[key]
  if (value === undefined && bar !== -1) return name.slice(bar + 1)
  if (value === undefined) return guessVariable(key)
  if (typeof value === 'string' && value.startsWith('$') && depth < 10) value = lookup(vars, value, depth + 1)
  return value
}

function truthy(value: any): boolean {
  if (Array.isArray(value)) return value.length > 0
  return !!value && value !== 'false'
}

function evaluate(expression: string, vars: Vars): any {
  const tokens = expression.match(/\(|\)|\$[\w.|]+|[<>=!]=|[<>]|[-+*/]|\d+(?:\.\d+)?|'[^']*'|"[^"]*"|[A-Za-z_][\w.]*/g) ?? []
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]
  const primary = (): any => {
    const token = next()
    if (token === undefined) return false
    if (token === '(') {
      const value = orExpr()
      if (peek() === ')') next()
      return value
    }
    if (token === 'not') return !truthy(primary())
    if (token === '-') return -Number(primary())
    if (token.startsWith('$')) return lookup(vars, token)
    if (token === 'true') return true
    if (token === 'false') return false
    if (/^\d/.test(token)) return Number(token)
    if (token.startsWith("'") || token.startsWith('"')) return token.slice(1, -1)
    return token
  }
  const product = (): any => {
    let value = primary()
    while (peek() === '*' || peek() === '/') {
      const op = next()
      const right = primary()
      value = op === '*' ? Number(value) * Number(right) : Number(value) / Number(right)
    }
    return value
  }
  const sum = (): any => {
    let value = product()
    while (peek() === '+' || peek() === '-') {
      const op = next()
      const right = product()
      value = op === '+' ? Number(value) + Number(right) : Number(value) - Number(right)
    }
    return value
  }
  const comparison = (): any => {
    let value = sum()
    while ([ '==', '!=', '<', '>', '<=', '>=' ].includes(peek())) {
      const op = next()
      const right = sum()
      value = op === '==' ? value == right : op === '!=' ? value != right : op === '<' ? value < right : op === '>' ? value > right : op === '<=' ? value <= right : value >= right
    }
    return value
  }
  const andExpr = (): any => {
    let value = comparison()
    while (peek() === 'and') {
      next()
      const right = comparison()
      value = truthy(value) && truthy(right)
    }
    return value
  }
  const orExpr = (): any => {
    let value = andExpr()
    while (peek() === 'or') {
      next()
      const right = andExpr()
      value = truthy(value) || truthy(right)
    }
    return value
  }
  return orExpr()
}

const EXPRESSION = /^\s*\(.*\)\s*$|\b(?:not|and|or)\b/

function substitute(value: any, vars: Vars, depth = 0): any {
  if (depth > 8) return value
  if (typeof value === 'string') {
    if (/^\$[\w.|]+$/.test(value)) return substitute(lookup(vars, value), vars, depth + 1)
    if (value.includes('$') && EXPRESSION.test(value)) return evaluate(value, vars)
    return value
  }
  if (Array.isArray(value)) return value.map(item => substitute(item, vars, depth + 1))
  return value
}

type Budget = { nodes: number, overrides: Record<string, boolean>, uses: { node: Node, expressions: string[] }[] }

function resolveNode(index: UiIndex, ns: string, name: string, ref: string | null, overrides: Record<string, any>, parentVars: Vars, depth: number, budget: Budget): Node | null {
  if (depth > MAX_DEPTH || budget.nodes >= MAX_NODES) return null
  const vars: Vars = Object.assign({}, parentVars)
  vars[EXPLICIT] = new Set<string>(parentVars[EXPLICIT] ?? Object.keys(parentVars))
  const merged: Record<string, any> = {}
  let baseRef = ref
  if (baseRef?.startsWith('$')) baseRef = lookup(vars, baseRef)
  if (typeof baseRef === 'string' && baseRef.startsWith('@')) baseRef = baseRef.slice(1)
  let levelNs = ns
  if (typeof baseRef === 'string' && baseRef) {
    const [ refNs, refName ] = splitRef(baseRef, ns)
    const levels = chain(index, refNs, refName)
    if (!levels.length) return null
    for (const level of levels) {
      let base = level.def.base
      if (base?.startsWith('$')) {
        const dynamic = lookup(vars, base)
        if (typeof dynamic === 'string') {
          const [ dynNs, dynName ] = splitRef(dynamic.replace(/^@/, ''), level.ns)
          for (const inner of chain(index, dynNs, dynName)) applyLevel(inner.def.props, vars, merged)
        }
      }
      applyLevel(level.def.props, vars, merged)
      levelNs = level.ns
    }
  }
  applyLevel(overrides, vars, merged)
  for (const entry of merged.variables ?? []) {
    if (!entry || typeof entry !== 'object') continue
    const requires = entry.requires === undefined ? true : truthy(substitute(entry.requires, vars))
    if (!requires) continue
    for (const [ key, value ] of Object.entries(entry)) if (key.startsWith('$')) {
      vars[key] = value
      vars[EXPLICIT].add(key)
    }
  }
  budget.nodes++
  const props: Record<string, any> = {}
  for (const [ key, value ] of Object.entries(merged)) {
    if (key === 'controls' || key === 'variables' || key === 'bindings' || key === 'button_mappings' || key === 'anims') continue
    props[key] = substitute(value, vars)
  }
  const type = typeof props.type === 'string' ? props.type : 'panel'
  const node: Node = { name, type, props, vars, children: [], x: 0, y: 0, w: 0, h: 0, visible: props.visible !== false, measured: new Map() }
  if (truthy(props.ignored)) return null
  const bindings = substitute(merged.bindings, vars)
  const bound = boundVisible(bindings, vars, budget, node)
  if (bound.visible !== null) props.__bound = true
  if (bound.toggleView) props.__toggleView = true
  if (node.visible && bound.visible === false) {
    node.visible = false
    props.__boundHidden = true
  }
  const hidden = hiddenStates(node)
  for (const entry of merged.controls ?? []) {
    if (!entry || typeof entry !== 'object') continue
    const key = Object.keys(entry)[0]
    if (!key) continue
    const [ rawName, childBase ] = key.split('@')
    const childName = rawName.startsWith('$') ? String(lookup(vars, rawName) ?? rawName) : rawName
    const childOverrides = entry[key] && typeof entry[key] === 'object' ? entry[key] : {}
    const child = resolveNode(index, levelNs, childName, childBase ?? null, childOverrides, vars, depth + 1, budget)
    if (!child) continue
    if (hidden.has(childName)) child.visible = false
    node.children.push(child)
  }
  const toggled = node.children.filter(child => child.props.__toggleView)
  toggled.forEach((child, i) => { if (i > 0 || toggled.length === 1) child.visible = false })
  if (type !== 'grid' && type !== 'stack_panel') {
    const groups = new Map<string, Node>()
    for (const child of node.children) {
      if (!child.visible || !child.props.__bound) continue
      const key = `${child.props.anchor_from ?? 'center'}|${child.props.anchor_to ?? 'center'}|${JSON.stringify(child.props.offset ?? null)}|${JSON.stringify(child.props.size ?? null)}`
      if (groups.has(key)) child.visible = false
      else groups.set(key, child)
    }
  }
  if (type === 'grid') {
    const [ cols, rows ] = gridDimensions(props)
    for (const child of node.children) {
      const position = child.props.grid_position
      if (Array.isArray(position)) child.props.__cell = [ Number(position[0]) || 0, Number(position[1]) || 0, cols, rows ]
    }
    if (typeof props.grid_item_template === 'string') {
      const limit = Math.min(cols * rows, 256, typeof props.maximum_grid_items === 'number' ? props.maximum_grid_items : Infinity)
      for (let i = 0; i < limit; i++) {
        const child = resolveNode(index, levelNs, `item_${i}`, props.grid_item_template, {}, vars, depth + 1, budget)
        if (!child) break
        child.props.__cell = [ i % cols, Math.floor(i / cols), cols, rows ]
        node.children.push(child)
      }
    }
  }
  return node
}

const GRID_GUESSES: [ RegExp, [ number, number ] ][] = [
  [ /hotbar/, [ 9, 1 ] ],
  [ /inv_|inventory/, [ 9, 3 ] ],
  [ /equip|armor/, [ 1, 4 ] ],
  [ /crafting/, [ 3, 3 ] ],
]

function gridDimensions(props: Record<string, any>): [ number, number ] {
  const dims = props.grid_dimensions
  if (Array.isArray(dims) && typeof dims[0] === 'number' && typeof dims[1] === 'number') return [ Math.max(1, Math.min(32, dims[0])), Math.max(1, Math.min(32, dims[1])) ]
  const binding = String(props.grid_dimension_binding ?? '')
  for (const [ pattern, size ] of GRID_GUESSES) if (pattern.test(binding)) return size
  return [ 1, 1 ]
}

const INVERSE_BINDINGS: [ RegExp, string ][] = [ [ /_disabled$/, '_enabled' ], [ /_off$/, '_on' ], [ /_hidden$/, '_visible' ], [ /_invisible$/, '_visible' ] ]

function inverseOf(name: string): string | null {
  for (const [ pattern, replacement ] of INVERSE_BINDINGS) if (pattern.test(name)) return name.replace(pattern, replacement)
  return null
}

function bindingValue(overrides: Record<string, boolean>, name: string): boolean {
  if (name in overrides) return overrides[name]
  const inverse = inverseOf(name)
  if (inverse) return !bindingValue(overrides, inverse)
  return SHOWN_BINDINGS.has(name)
}

function evaluateBinding(expression: string, overrides: Record<string, boolean>, flipped: string | null): boolean {
  return truthy(evaluate(expression.replace(/#[\w.]+/g, name => String(name === flipped ? !bindingValue(overrides, name) : bindingValue(overrides, name))), {}))
}

function boundVisible(bindings: any, vars: Vars, budget: Budget, node: Node): { visible: boolean | null, toggleView: boolean } {
  const out = { visible: null as boolean | null, toggleView: false }
  if (!Array.isArray(bindings)) return out
  const expressions: string[] = []
  for (const binding of bindings) {
    if (!binding || typeof binding !== 'object') continue
    const override = substitute(binding.binding_name_override, vars)
    const target = substitute(binding.target_property_name, vars)
    let expression: any = null
    if (override === '#visible') expression = substitute(binding.binding_name, vars)
    else if (target === '#visible') expression = substitute(binding.source_property_name, vars)
    if (typeof expression !== 'string' || !expression.trim()) continue
    if (expression === '#toggle_state') {
      out.toggleView = true
      continue
    }
    expressions.push(expression)
    if (out.visible === false) continue
    out.visible = evaluateBinding(expression, budget.overrides, null)
  }
  if (expressions.length) budget.uses.push({ node, expressions })
  return out
}

function drawable(node: Node, layout: Layout): boolean {
  if (node.type === 'image' && textureOf(node, layout)) return true
  if (node.type === 'label' && labelText(node, layout.index)) return true
  return node.children.some(child => (child.visible || child.props.__boundHidden) && drawable(child, layout))
}

export type UiUse = { names: string[], expressions: string[], parent: number, blocked: boolean, drawable: boolean }

function collectUses(root: Node, budget: Budget, layout: Layout): UiUse[] {
  const byNode = new Map(budget.uses.map(use => [ use.node, use ]))
  const out: UiUse[] = []
  const walk = (node: Node, parent: number, blocked: boolean) => {
    const own = blocked || (!node.visible && !node.props.__boundHidden)
    const use = byNode.get(node)
    let index = parent
    if (use) {
      index = out.length
      out.push({ names: Array.from(new Set(use.expressions.flatMap(expression => expression.match(/#[\w.]+/g) ?? []))), expressions: use.expressions, parent, blocked: own, drawable: drawable(node, layout) })
    }
    for (const child of node.children) walk(child, index, own)
  }
  walk(root, -1, false)
  return out
}

export function effectiveToggles(uses: UiUse[], overrides: Record<string, boolean>): Record<string, boolean> {
  const shown: boolean[] = []
  const out: Record<string, boolean> = {}
  uses.forEach((use, i) => {
    const visible = !use.blocked && (use.parent === -1 || shown[use.parent])
    let self = visible
    for (const expression of use.expressions) {
      const current = evaluateBinding(expression, overrides, null)
      if (visible && use.drawable) {
        for (const name of expression.match(/#[\w.]+/g) ?? []) {
          if (!IGNORED_BINDINGS.has(name) && evaluateBinding(expression, overrides, name) !== current) out[name] ??= bindingValue(overrides, name)
        }
      }
      if (!current) {
        self = false
        break
      }
    }
    shown[i] = self
  })
  for (const name of Object.keys(out)) {
    const inverse = inverseOf(name)
    if (inverse && inverse in out) delete out[name]
  }
  return out
}

function hiddenStates(node: Node): Set<string> {
  const hidden = new Set<string>()
  const { props, type } = node
  if (type === 'button') {
    const locked = props.enabled === false && typeof props.locked_control === 'string' && props.locked_control
    const shown = locked || props.default_control
    for (const key of [ 'default_control', 'hover_control', 'pressed_control', 'locked_control' ]) if (typeof props[key] === 'string' && props[key] !== shown) hidden.add(props[key])
  }
  if (type === 'toggle' || type === 'dropdown') {
    for (const key of [ 'checked_control', 'checked_hover_control', 'checked_locked_control', 'checked_locked_hover_control', 'unchecked_hover_control', 'unchecked_locked_control', 'unchecked_locked_hover_control' ]) {
      if (typeof props[key] === 'string' && props[key] !== props.unchecked_control) hidden.add(props[key])
    }
  }
  return hidden
}


type Content = (axis: 0 | 1, largest: boolean) => [ number, number ]

function parseSize(value: any, axis: 0 | 1, parent: number, self: [ number, number ], content: Content, intrinsic: () => [ number, number ], sibling = parent): number | null {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text === 'default') return intrinsic()[axis]
  if (text === 'fill') return parent
  const terms = text.match(/[-+]?\s*[\d.]+\s*(?:%cm|%sm|%c|%x|%y|%|px)?/g)
  if (!terms) return null
  let total = 0
  for (const raw of terms) {
    const term = raw.replace(/\s+/g, '')
    const amount = parseFloat(term)
    if (Number.isNaN(amount)) continue
    if (term.endsWith('%cm')) total += amount / 100 * content(axis, true)[axis]
    else if (term.endsWith('%sm')) total += amount / 100 * sibling
    else if (term.endsWith('%c')) total += amount / 100 * content(axis, false)[axis]
    else if (term.endsWith('%x')) total += amount / 100 * self[0]
    else if (term.endsWith('%y')) total += amount / 100 * self[1]
    else if (term.endsWith('%')) total += amount / 100 * parent
    else total += amount
  }
  return total
}

function fontOf(node: Node): { scale: number, bold: boolean, line: number } {
  const props = node.props
  const named = typeof props.font_size === 'string' ? FONT_SCALES[props.font_size] : undefined
  const factor = typeof props.font_scale_factor === 'number' ? props.font_scale_factor : 1
  const bold = props.font_type === 'MinecraftTen'
  const scale = (named ?? 1) * factor * (bold ? 1.25 : 1)
  const padding = typeof props.line_padding === 'number' ? props.line_padding : 0
  return { scale, bold, line: LINE * scale + padding }
}

function labelText(node: Node, index: UiIndex): string {
  let text = node.props.text
  if (typeof text !== 'string') return ''
  if (text.startsWith('#')) return ''
  if (node.props.localize !== false) text = index.lang.get(text) ?? text
  return text.replace(/§./g, '')
}

function wrapText(text: string, font: BitmapFont, scale: number, bold: boolean, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\\n|\n/)) {
    const words = paragraph.split(' ')
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (line && font.measure(candidate, scale, bold) > maxWidth) {
        lines.push(line)
        line = word
      } else line = candidate
    }
    lines.push(line)
  }
  return lines
}

type Layout = { index: UiIndex, font: BitmapFont, textures: Map<string, TextureInfo | null> }
type TextureInfo = { bitmap: ImageBitmap, nineslice: [ number, number, number, number ] | null, base: [ number, number ] }

function intrinsicSize(node: Node, layout: Layout, parent: [ number, number ]): [ number, number ] {
  if (node.type === 'label') {
    const text = labelText(node, layout.index)
    const { scale, bold, line } = fontOf(node)
    const lines = text.split(/\\n|\n/)
    const width = Math.max(0, ...lines.map(entry => layout.font.measure(entry, scale, bold)))
    return [ Math.ceil(width), Math.ceil(lines.length * line) ]
  }
  return parent
}

function textureOf(node: Node, layout: Layout): TextureInfo | null {
  const texture = node.props.texture
  if (typeof texture !== 'string' || texture.startsWith('$') || texture.startsWith('#')) return null
  return layout.textures.get(texture) ?? null
}

type Measured = { w: number, h: number, lines?: string[] }

function sizeSpec(node: Node): [ any, any ] {
  const size = node.props.size
  if (Array.isArray(size)) return [ size[0], size[1] ]
  if (node.type === 'stack_panel') return node.props.orientation === 'horizontal' ? [ '100%c', '100%' ] : [ '100%', '100%c' ]
  return [ 'default', 'default' ]
}

function cellSize(box: [ number, number ], child: Node): [ number, number ] {
  const cell = child.props.__cell
  return cell ? [ box[0] / cell[2], box[1] / cell[3] ] : box
}

function measure(node: Node, box: [ number, number ], layout: Layout, depth = 0): Measured {
  const key = `${box[0]}|${box[1]}`
  const cached = node.measured.get(key)
  if (cached) return cached
  const result: Measured = { w: box[0], h: box[1] }
  if (depth > MAX_DEPTH) return result
  const props = node.props
  const [ sw, sh ] = sizeSpec(node)
  const self: [ number, number ] = [ box[0], box[1] ]
  const content: Content = (axis, largest) => {
    if (node.type === 'label') return intrinsicSize(node, layout, box)
    const inner: [ number, number ] = axis === 0 ? [ 0, self[1] ] : [ self[0], 0 ]
    return extentOf(node, inner, largest, layout, depth)
  }
  const intrinsic = (): [ number, number ] => node.type === 'stack_panel' || node.type === 'grid' ? [ content(0, false)[0], content(1, false)[1] ] : intrinsicSize(node, layout, box)
  let w = parseSize(sw, 0, box[0], self, content, intrinsic)
  if (w === null) w = box[0]
  self[0] = w
  let h = parseSize(sh, 1, box[1], self, content, intrinsic)
  if (h === null) h = box[1]
  self[1] = h
  if (typeof sw === 'string' && sw.includes('%y')) w = parseSize(sw, 0, box[0], self, content, intrinsic) ?? w
  const clamp = (limitKey: string, pick: (a: number, b: number) => number) => {
    const limit = Array.isArray(props[limitKey]) ? props[limitKey] : null
    if (!limit) return
    const lw = parseSize(limit[0], 0, box[0], self, content, intrinsic)
    const lh = parseSize(limit[1], 1, box[1], self, content, intrinsic)
    if (lw !== null) w = pick(w!, lw)
    if (lh !== null) h = pick(h!, lh)
  }
  clamp('max_size', Math.min)
  clamp('min_size', Math.max)
  w = Math.max(0, w)
  h = Math.max(0, h)
  if (node.type === 'label') {
    const text = labelText(node, layout.index)
    const { scale, bold, line } = fontOf(node)
    const wrapped = sw !== 'default' && w > 0
    const lines = wrapped ? wrapText(text, layout.font, scale, bold, w) : text.split(/\\n|\n/)
    result.lines = lines
    if (sh === 'default') h = Math.ceil(lines.length * line)
  }
  result.w = w
  result.h = h
  node.measured.set(key, result)
  return result
}

function extentOf(node: Node, box: [ number, number ], largest: boolean, layout: Layout, depth: number): [ number, number ] {
  if (node.type === 'grid' && node.children.length) {
    const cell = node.children[0].props.__cell
    const item = measure(node.children[0], [ 0, 0 ], layout, depth + 1)
    return cell ? [ item.w * cell[2], item.h * cell[3] ] : [ item.w, item.h ]
  }
  const sum = node.type === 'stack_panel' && !largest
  let w = 0
  let h = 0
  for (const child of node.children) {
    if (!child.visible) continue
    const size = measure(child, box, layout, depth + 1)
    if (sum) {
      w += size.w
      h += size.h
    } else {
      w = Math.max(w, size.w)
      h = Math.max(h, size.h)
    }
  }
  return [ w, h ]
}

function anchorOf(value: any, fallback: Anchor): Anchor {
  return typeof value === 'string' && ANCHORS[value] ? ANCHORS[value] : fallback
}

function offsetOf(node: Node, parent: [ number, number ]): [ number, number ] {
  const offset = Array.isArray(node.props.offset) ? node.props.offset : [ 0, 0 ]
  const noop = (): [ number, number ] => [ 0, 0 ]
  const zero: Content = () => [ 0, 0 ]
  return [
    parseSize(offset[0], 0, parent[0], [ node.w, node.h ], zero, noop) ?? 0,
    parseSize(offset[1], 1, parent[1], [ node.w, node.h ], zero, noop) ?? 0,
  ]
}

function arrange(node: Node, box: [ number, number ], layout: Layout, depth = 0, override?: [ number, number ]) {
  const measured = measure(node, box, layout, depth)
  node.w = override ? override[0] : measured.w
  node.h = override ? override[1] : measured.h
  if (measured.lines) node.props.__lines = measured.lines
  if (depth > MAX_DEPTH) return
  const inner: [ number, number ] = [ node.w, node.h ]
  const sizes = node.children.map((child): [ number, number ] => {
    const size = measure(child, inner, layout, depth + 1)
    return child.props.__cell && !Array.isArray(child.props.size) ? cellSize(inner, child) : [ size.w, size.h ]
  })
  const widest = Math.max(0, ...sizes.map(size => size[0]))
  const tallest = Math.max(0, ...sizes.map(size => size[1]))
  node.children.forEach((child, i) => {
    if (child.props.inherit_max_sibling_width) sizes[i][0] = widest
    if (child.props.inherit_max_sibling_height) sizes[i][1] = tallest
  })
  if (node.type === 'stack_panel') arrangeStack(node, inner, sizes, layout, depth)
  else arrangePanel(node, inner, sizes, layout, depth)
  if (node.type === 'scroll_view' && settleScroll(node, layout, depth)) arrange(node, box, layout, depth, [ node.w, node.h ])
}

function findNamed(node: Node, name: string): Node | null {
  for (const child of node.children) {
    if (child.name === name) return child
    const found = findNamed(child, name)
    if (found) return found
  }
  return null
}

function settleScroll(node: Node, layout: Layout, depth: number): boolean {
  const props = node.props
  const content = findNamed(node, typeof props.scroll_content === 'string' ? props.scroll_content : 'scrolling_content')
  const port = findNamed(node, typeof props.scroll_view_port === 'string' ? props.scroll_view_port : 'scrolling_view_port')
  if (!content || !port) return false
  const bar = findNamed(node, typeof props.scroll_box_and_track_panel === 'string' ? props.scroll_box_and_track_panel : 'bar_and_track')
  if (content.h <= port.h) {
    if (!bar || !bar.visible || props.scrollbar_always_visible !== false) return false
    bar.visible = false
    return true
  }
  const box = findNamed(node, typeof props.scrollbar_box === 'string' ? props.scrollbar_box : 'box')
  const track = findNamed(node, typeof props.scrollbar_track === 'string' ? props.scrollbar_track : 'track')
  if (!box || !track) return false
  const height = Math.max(1, Math.round(track.h * port.h / content.h))
  arrange(box, [ box.w, height ], layout, depth + 1, [ box.w, height ])
  box.y = 0
  return false
}

function arrangePanel(node: Node, inner: [ number, number ], sizes: [ number, number ][], layout: Layout, depth: number) {
  node.children.forEach((child, i) => {
    arrange(child, inner, layout, depth + 1, sizes[i])
    const [ ox, oy ] = offsetOf(child, inner)
    const cell = child.props.__cell
    if (cell) {
      child.x = cell[0] * inner[0] / cell[2] + ox
      child.y = cell[1] * inner[1] / cell[3] + oy
      return
    }
    const from = anchorOf(child.props.anchor_from, [ 0.5, 0.5 ])
    const to = anchorOf(child.props.anchor_to, [ 0.5, 0.5 ])
    child.x = from[0] * inner[0] - to[0] * child.w + ox
    child.y = from[1] * inner[1] - to[1] * child.h + oy
  })
}

function arrangeStack(node: Node, inner: [ number, number ], sizes: [ number, number ][], layout: Layout, depth: number) {
  const vertical = node.props.orientation !== 'horizontal'
  const axis = vertical ? 1 : 0
  const fills = node.children.map(child => child.visible && sizeSpec(child)[axis] === 'fill')
  const fixed = sizes.reduce((sum, size, i) => sum + (fills[i] || !node.children[i].visible ? 0 : size[axis]), 0)
  const fillCount = fills.filter(Boolean).length
  const fillSize = fillCount ? Math.max(0, inner[axis] - fixed) / fillCount : 0
  let cursor = 0
  node.children.forEach((child, i) => {
    if (!child.visible) return
    const size: [ number, number ] = [ sizes[i][0], sizes[i][1] ]
    if (fills[i]) size[axis] = fillSize
    arrange(child, inner, layout, depth + 1, size)
    const [ ox, oy ] = offsetOf(child, inner)
    if (vertical) {
      child.y = cursor + oy
      child.x = ox
      cursor += child.h
    } else {
      child.x = cursor + ox
      child.y = oy
      cursor += child.w
    }
  })
}


async function collectTextures(node: Node, dr: DeltaResult, version: string, index: UiIndex, out: Map<string, TextureInfo | null>) {
  const pending: Promise<void>[] = []
  const visit = (current: Node) => {
    if (current.type === 'image' && typeof current.props.texture === 'string' && !out.has(current.props.texture)) {
      const texture = current.props.texture
      out.set(texture, null)
      pending.push(loadTexture(dr, version, index, texture).then(info => { out.set(texture, info) }))
    }
    for (const child of current.children) visit(child)
  }
  visit(node)
  await Promise.all(pending)
}

const textureCache = new WeakMap<DeltaResult, Map<string, Promise<TextureInfo | null>>>()

function loadTexture(dr: DeltaResult, version: string, index: UiIndex, texture: string): Promise<TextureInfo | null> {
  let cache = textureCache.get(dr)
  if (!cache) textureCache.set(dr, cache = new Map())
  const key = `${version}:${texture}`
  let pending = cache.get(key)
  if (!pending) cache.set(key, pending = readTexture(dr, version, index, texture))
  return pending
}

async function readTexture(dr: DeltaResult, version: string, index: UiIndex, texture: string): Promise<TextureInfo | null> {
  const base = `resource_pack/${texture.replace(/\.(png|tga|jpg|jpeg)$/i, '')}`
  const path = [ '.png', '.jpg', '.jpeg', '.tga' ].map(ext => base + ext).find(candidate => index.textures.has(candidate))
  if (!path) return null
  let bitmap: ImageBitmap
  try {
    bitmap = await imageFromBytes(await dr.getEntry(version, path))
  } catch {
    return null
  }
  let nineslice: TextureInfo['nineslice'] = null
  let size: [ number, number ] = [ bitmap.width, bitmap.height ]
  if (index.textures.has(`${base}.json`)) {
    try {
      const meta = parseJson(await dr.getEntry(version, `${base}.json`))
      if (Array.isArray(meta.base_size) && meta.base_size.length === 2) size = [ Number(meta.base_size[0]) || size[0], Number(meta.base_size[1]) || size[1] ]
      const slice = meta.nineslice_size
      if (typeof slice === 'number') nineslice = [ slice, slice, slice, slice ]
      else if (Array.isArray(slice) && slice.length === 4) nineslice = slice.map(Number) as TextureInfo['nineslice']
    } catch {}
  }
  return { bitmap, nineslice, base: size }
}

function colorOf(value: any): [ number, number, number ] | null {
  if (Array.isArray(value) && value.length >= 3 && value.every(v => typeof v === 'number')) return [ value[0], value[1], value[2] ]
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return [ parseInt(value.slice(1, 3), 16) / 255, parseInt(value.slice(3, 5), 16) / 255, parseInt(value.slice(5, 7), 16) / 255 ]
  if (typeof value === 'string') {
    const named: Record<string, [ number, number, number ]> = { white: [ 1, 1, 1 ], black: [ 0, 0, 0 ], red: [ 1, 0, 0 ], green: [ 0, 1, 0 ], blue: [ 0, 0, 1 ], yellow: [ 1, 1, 0 ], gray: [ 0.5, 0.5, 0.5 ], grey: [ 0.5, 0.5, 0.5 ] }
    return named[value.toLowerCase()] ?? null
  }
  return null
}

function cssColor(color: [ number, number, number ], alpha = 1) {
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${alpha})`
}

type Command = { z: number, order: number, clip: Rect | null, draw: (ctx: OffscreenCanvasRenderingContext2D) => void }

function collect(node: Node, ox: number, oy: number, z: number, alpha: number, clip: Rect | null, layout: Layout, commands: Command[]) {
  if (!node.visible) return
  const x = ox + node.x
  const y = oy + node.y
  const layer = typeof node.props.layer === 'number' ? node.props.layer : 0
  const nodeZ = z + layer
  const ownAlpha = typeof node.props.alpha === 'number' ? node.props.alpha : 1
  const drawAlpha = alpha * ownAlpha
  const childAlpha = node.props.propagate_alpha ? drawAlpha : alpha
  if (node.type === 'image') {
    const texture = textureOf(node, layout)
    if (texture) commands.push({ z: nodeZ, order: commands.length, clip, draw: ctx => drawImage(ctx, node, texture, x, y, drawAlpha) })
  } else if (node.type === 'label') {
    commands.push({ z: nodeZ, order: commands.length, clip, draw: ctx => drawLabel(ctx, node, x, y, drawAlpha, layout) })
  }
  let childClip = clip
  if (node.props.clips_children) {
    const own = { x, y, w: node.w, h: node.h }
    childClip = clip ? intersect(clip, own) : own
  }
  for (const child of node.children) collect(child, x, y, nodeZ, childAlpha, childClip, layout, commands)
}

function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) }
}

function tinted(texture: TextureInfo, color: [ number, number, number ] | null): CanvasImageSource {
  if (!color || (color[0] === 1 && color[1] === 1 && color[2] === 1)) return texture.bitmap
  const canvas = new OffscreenCanvas(texture.bitmap.width, texture.bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(texture.bitmap, 0, 0)
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = cssColor(color)
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(texture.bitmap, 0, 0)
  return canvas
}

function fitSlices(a: number, b: number, size: number): [ number, number ] {
  const room = Math.max(0, size - 1)
  if (a + b <= room) return [ a, b ]
  const scale = a + b ? room / (a + b) : 0
  return [ Math.floor(a * scale), Math.floor(b * scale) ]
}

function drawImage(ctx: OffscreenCanvasRenderingContext2D, node: Node, texture: TextureInfo, x: number, y: number, alpha: number) {
  const props = node.props
  const source = tinted(texture, colorOf(props.color))
  const uv = Array.isArray(props.uv) && typeof props.uv[0] === 'number' ? props.uv : [ 0, 0 ]
  const uvSize = Array.isArray(props.uv_size) && typeof props.uv_size[0] === 'number' ? props.uv_size : [ texture.bitmap.width, texture.bitmap.height ]
  const sx = uv[0]
  const sy = uv[1]
  const sw = uvSize[0]
  const sh = uvSize[1]
  const dx = x * UI_SCALE
  const dy = y * UI_SCALE
  const dw = node.w * UI_SCALE
  const dh = node.h * UI_SCALE
  if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) return
  ctx.globalAlpha = alpha
  const slice = texture.nineslice
  if (slice && !Array.isArray(props.uv_size)) {
    const scaleX = texture.bitmap.width / texture.base[0]
    const scaleY = texture.bitmap.height / texture.base[1]
    const [ l, r ] = fitSlices(slice[0], slice[2], texture.base[0])
    const [ t, b ] = fitSlices(slice[1], slice[3], texture.base[1])
    const cols = [ 0, l * scaleX, texture.bitmap.width - r * scaleX, texture.bitmap.width ]
    const rows = [ 0, t * scaleY, texture.bitmap.height - b * scaleY, texture.bitmap.height ]
    const left = Math.min(l * UI_SCALE, dw / 2)
    const right = Math.min(r * UI_SCALE, dw / 2)
    const top = Math.min(t * UI_SCALE, dh / 2)
    const bottom = Math.min(b * UI_SCALE, dh / 2)
    const dcols = [ dx, dx + left, dx + dw - right, dx + dw ]
    const drows = [ dy, dy + top, dy + dh - bottom, dy + dh ]
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const cw = cols[i + 1] - cols[i]
        const ch = rows[j + 1] - rows[j]
        const tw = dcols[i + 1] - dcols[i]
        const th = drows[j + 1] - drows[j]
        if (cw <= 0 || ch <= 0 || tw <= 0 || th <= 0) continue
        ctx.drawImage(source, cols[i], rows[j], cw, ch, dcols[i], drows[j], tw, th)
      }
    }
  } else if (props.tiled === true || props.tiled === 'x' || props.tiled === 'y') {
    const tile = new OffscreenCanvas(Math.max(1, sw), Math.max(1, sh))
    tile.getContext('2d')!.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh)
    const pattern = ctx.createPattern(tile, props.tiled === 'x' ? 'repeat-x' : props.tiled === 'y' ? 'repeat-y' : 'repeat')!
    ctx.save()
    ctx.translate(dx, dy)
    ctx.scale(UI_SCALE, UI_SCALE)
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, node.w, node.h)
    ctx.restore()
  } else {
    let tw = dw
    let th = dh
    let tx = dx
    let ty = dy
    if (props.keep_ratio !== false && props.fill !== true) {
      const scale = Math.min(dw / sw, dh / sh)
      tw = sw * scale
      th = sh * scale
      tx = dx + (dw - tw) / 2
      ty = dy + (dh - th) / 2
    }
    ctx.drawImage(source, sx, sy, sw, sh, tx, ty, tw, th)
  }
  ctx.globalAlpha = 1
}

function drawLabel(ctx: OffscreenCanvasRenderingContext2D, node: Node, x: number, y: number, alpha: number, layout: Layout) {
  const lines: string[] = node.props.__lines ?? [ labelText(node, layout.index) ]
  if (!lines.some(line => line)) return
  const { scale, bold, line } = fontOf(node)
  const color = colorOf(node.props.color) ?? [ 1, 1, 1 ]
  const alignment = typeof node.props.text_alignment === 'string' ? node.props.text_alignment : /left/.test(String(node.props.anchor_to ?? '')) ? 'left' : /right/.test(String(node.props.anchor_to ?? '')) ? 'right' : 'center'
  ctx.globalAlpha = alpha
  const totalHeight = lines.length * line
  const startY = y + Math.max(0, (node.h - totalHeight) / 2)
  lines.forEach((text, i) => {
    const width = layout.font.measure(text, scale, bold)
    const lineX = alignment === 'left' ? x : alignment === 'right' ? x + node.w - width : x + (node.w - width) / 2
    const lineY = startY + i * line + scale
    if (node.props.shadow) layout.font.draw(ctx, text, Math.round(lineX + scale) * UI_SCALE, Math.round(lineY + scale) * UI_SCALE, scale * UI_SCALE, [ color[0] * 0.25, color[1] * 0.25, color[2] * 0.25 ], bold)
    layout.font.draw(ctx, text, Math.round(lineX) * UI_SCALE, Math.round(lineY) * UI_SCALE, scale * UI_SCALE, color, bold)
  })
  ctx.globalAlpha = 1
}

export type UiRender = { width: number, height: number, blank: boolean, bytes: Uint8Array<ArrayBuffer>, uses: UiUse[] }

type Painted = { root: Node, budget: Budget, layout: Layout, width: number, height: number, canvas: OffscreenCanvas, pixels: Uint32Array }
type Target = { dr: DeltaResult, version: string, index: UiIndex, font: BitmapFont, namespace: string, id: string }

async function paint(target: Target, overrides: Record<string, boolean>): Promise<Painted | null> {
  const { dr, version, index, font, namespace, id } = target
  const vars: Vars = Object.assign({}, index.globals, DEVICE_VARIABLES)
  const budget: Budget = { nodes: 0, overrides, uses: [] }
  const root = resolveNode(index, namespace, id, `${namespace}.${id}`, {}, vars, 0, budget)
  if (!root) return null
  const layout: Layout = { index, font, textures: new Map() }
  await collectTextures(root, dr, version, index, layout.textures)
  const screen: [ number, number ] = [ SCREEN_WIDTH, SCREEN_HEIGHT ]
  arrange(root, screen, layout)
  const commands: Command[] = []
  collect(root, 0, 0, 0, 1, null, layout, commands)
  commands.sort((a, b) => a.z - b.z || a.order - b.order)
  const width = Math.max(1, Math.ceil(root.w))
  const height = Math.max(1, Math.ceil(root.h))
  const canvas = new OffscreenCanvas(width * UI_SCALE, height * UI_SCALE)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  for (const command of commands) {
    ctx.save()
    if (command.clip) {
      ctx.beginPath()
      ctx.rect(command.clip.x * UI_SCALE, command.clip.y * UI_SCALE, command.clip.w * UI_SCALE, command.clip.h * UI_SCALE)
      ctx.clip()
    }
    command.draw(ctx)
    ctx.restore()
  }
  const pixels = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer)
  return { root, budget, layout, width, height, canvas, pixels }
}

export async function renderBedrockUi(dr: DeltaResult, version: string, path: string, id: string, overrides: Record<string, boolean> = {}): Promise<UiRender | null> {
  const index = await uiIndex(dr, version)
  const file = index.files.get(path)
  if (!file) return null
  const font = await loadBedrockFont()
  const target: Target = { dr, version, index, font, namespace: file.namespace, id }
  const base = await paint(target, overrides)
  if (!base) return null
  const blank = !base.pixels.some(pixel => pixel !== 0)
  const blob = await base.canvas.convertToBlob({ type: 'image/png' })
  return { width: base.width, height: base.height, blank, bytes: new Uint8Array(await blob.arrayBuffer()), uses: collectUses(base.root, base.budget, base.layout) }
}
