import type { DeltaResult } from '@/delta_providers'
import { legacyVariant } from '@/util/legacyItems'

export interface LootStack {
  id: string
  count: number
  enchanted?: boolean
  components?: Record<string, any>
  via?: string
}

export interface LootOdds {
  id: string
  components?: Record<string, any>
  chance: number
  avg: number
  min: number
  max: number
  via: string[]
}

export interface LootRuleEntry {
  kind: 'item' | 'table' | 'tag' | 'dynamic' | 'other'
  id: string
  pct: number
  count: string | null
  note: string
}

export interface LootRulePool {
  rolls: string
  bonus: string | null
  chance: string | null
  entries: LootRuleEntry[]
}

export type TableReader = (id: string) => Promise<any>

export function deltaTableReader(dr: DeltaResult, version: string): TableReader {
  const cache = new Map<string, Promise<any>>()
  return id => {
    if (!cache.has(id)) cache.set(id, readTable(dr, version, id))
    return cache.get(id)!
  }
}

async function readTable(dr: DeltaResult, version: string, id: string) {
  if (!id) return null
  const [ ns, path ] = id.includes(':') ? id.split(':') : [ 'minecraft', id ]
  for (const dir of [ 'loot_table', 'loot_tables' ]) {
    const buf = await dr.getEntry(version, `data/${ns}/${dir}/${path}.json`).catch(() => null)
    if (buf) return JSON.parse(new TextDecoder().decode(buf))
  }
  return null
}

const strip = (s: any) => typeof s === 'string' ? s.replace(/^minecraft:/, '') : s

const TOOLS: Record<string, string> = {
  'tool/can_silk_touch': 'silk touch',
  'tool/can_shear': 'shears',
  'match_tool': 'the right tool',
}

const asList = (v: any) => v == null ? [] : Array.isArray(v) ? v : [ v ]
const conditionsOf = (node: any) => asList(node?.condition ?? node?.conditions)
const functionsOf = (node: any) => asList(node?.modifier ?? node?.functions)
const typeOf = (node: any) => strip(typeof node === 'string' ? node : node?.condition ?? node?.type ?? node?.function ?? '')

export const stackKey = (s: { id: string, components?: Record<string, any> }) =>
  s.id + '|' + JSON.stringify(s.components ?? null)

// seeded rather than Math.random: both sides of a diff must sample identically
function mulberry32(seed: number) {
  return () => {
    seed = seed + 0x6d2b79f5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

async function collectTables(
  table: any,
  read: TableReader,
  resolved = new Map<string, any>(),
): Promise<Map<string, any>> {
  for (const pool of table?.pools ?? []) {
    for (const entry of pool.entries ?? []) await collectEntry(entry, read, resolved)
  }
  return resolved
}

async function collectEntry(entry: any, read: TableReader, resolved: Map<string, any>) {
  const type = strip(entry.type || 'item')
  if (type === 'loot_table') {
    const ref = entry.value ?? entry.name
    if (typeof ref === 'object') await collectTables(ref, read, resolved)
    else if (typeof ref === 'string' && !resolved.has(ref)) {
      const nested = await read(ref)
      resolved.set(ref, nested)
      if (nested) await collectTables(nested, read, resolved)
    }
  } else if (type === 'alternatives' || type === 'group' || type === 'sequence') {
    for (const child of entry.children ?? []) await collectEntry(child, read, resolved)
  }
}

class Roller {
  #random: () => number
  #tables: Map<string, any>

  constructor(tables: Map<string, any>, seed: number) {
    this.#tables = tables
    this.#random = mulberry32(seed)
  }

  #rollNum(n: any, int = false): number {
    if (n == null) return 1
    if (typeof n === 'number') return n
    const t = strip(n.type || '')
    if (t === 'constant') return n.value ?? 1
    if (t === 'binomial') {
      let c = 0
      const N = this.#rollNum(n.n, true), p = this.#rollNum(n.p)
      for (let i = 0; i < N; i++) if (this.#random() < p) c++
      return c
    }
    if (n.min != null || n.max != null) {
      const a = this.#rollNum(n.min ?? 0, int), b = this.#rollNum(n.max ?? a, int)
      return int ? a + Math.floor(this.#random() * (b - a + 1)) : a + this.#random() * (b - a)
    }
    return n.value ?? 1
  }

  #passes(node: any) {
    return conditionsOf(node).every(c => this.#test(c) !== false)
  }

  #test(c: any): boolean | null {
    const type = typeOf(c)
    if (type === 'all_of') {
      const terms = asList(c.terms).map((t: any) => this.#test(t))
      return terms.includes(false) ? false : terms.includes(null) ? null : true
    }
    if (type === 'any_of') {
      const terms = asList(c.terms).map((t: any) => this.#test(t))
      return terms.includes(true) ? true : terms.includes(null) ? null : false
    }
    if (type === 'inverted') {
      const inner = this.#test(c.term ?? c.terms)
      return inner === null ? null : !inner
    }
    if (type in TOOLS) return false
    const chance = conditionChance(c)
    if (chance !== null) return this.#random() < this.#rollNum(chance)
    return null
  }

  #applyFunctions(fns: any[], stack: LootStack) {
    for (const f of fns) {
      const t = typeOf(f)
      if (!this.#passes(f)) continue
      if (t === 'set_count') stack.count = Math.max(1, Math.round(this.#rollNum(f.count, true)))
      else if (t === 'set_data') stack.id = legacyVariant(stack.id, Math.round(this.#rollNum(f.data, true)))
      else if (t === 'enchant_randomly' || t === 'enchant_with_levels') stack.enchanted = true
      else if (t === 'set_potion') stack.components = { 'minecraft:potion_contents': { potion: f.id } }
      else if (t === 'set_components') stack.components = { ...stack.components, ...f.components }
    }
  }

  #applyEntry(entry: any, pool: any, out: LootStack[], via?: string) {
    const type = strip(entry.type || 'item')
    if (type === 'item') {
      const stack: LootStack = { id: legacyVariant(strip(entry.name)), count: 1, via }
      this.#applyFunctions(functionsOf(entry), stack)
      this.#applyFunctions(functionsOf(pool), stack)
      out.push(stack)
    } else if (type === 'loot_table') {
      const ref = entry.value ?? entry.name
      const t = typeof ref === 'object' ? ref : this.#tables.get(ref)
      if (t) this.rollInto(t, out, typeof ref === 'string' ? strip(ref) : via)
    } else if (type === 'alternatives' || type === 'group' || type === 'sequence') {
      for (const c of entry.children ?? []) {
        if (type === 'alternatives') {
          if (this.#passes(c)) { this.#applyEntry(c, pool, out, via); break }
        } else this.#applyEntry(c, pool, out, via)
      }
    }
  }

  #pickEntry(entries: any[]) {
    const usable = entries.filter(e => this.#passes(e))
    const total = usable.reduce((a, e) => a + (e.weight ?? 1), 0)
    let r = this.#random() * total
    for (const e of usable) {
      r -= e.weight ?? 1
      if (r < 0) return e
    }
    return null
  }

  rollInto(table: any, out: LootStack[], via?: string) {
    for (const pool of table.pools ?? []) {
      if (!this.#passes(pool)) continue
      const n = Math.round(this.#rollNum(pool.rolls ?? 1, true))
      for (let i = 0; i < n; i++) {
        const entry = this.#pickEntry(pool.entries ?? [])
        if (entry) this.#applyEntry(entry, pool, out, via)
      }
    }
  }
}

class Unsupported extends Error {}

type Dist = Map<number, number>

interface ItemOutcome {
  id: string
  components?: Record<string, any>
  zero: number
  stacks: number
  total: number
  min: number
  max: number
  via: Set<string>
}

type Outcome = Map<string, ItemOutcome>

interface Variant {
  id: string
  components?: Record<string, any>
  p: number
  counts: Dist
}

function addTo(dist: Dist, value: number, p: number) {
  dist.set(value, (dist.get(value) ?? 0) + p)
}

function single(dist: Dist) {
  if (dist.size !== 1) throw new Unsupported()
  return dist.keys().next().value!
}

function distOf(n: any, int = false): Dist {
  if (n == null) return new Map([ [ 1, 1 ] ])
  if (typeof n === 'number') return new Map([ [ n, 1 ] ])
  const t = strip(n.type || '')
  if (t === 'constant') return new Map([ [ n.value ?? 1, 1 ] ])
  if (t === 'binomial') {
    const N = single(distOf(n.n, true)), p = single(distOf(n.p))
    if (!Number.isInteger(N)) throw new Unsupported()
    const dist: Dist = new Map()
    let choose = 1
    for (let k = 0; k <= N; k++) {
      dist.set(k, choose * p ** k * (1 - p) ** (N - k))
      choose = choose * (N - k) / (k + 1)
    }
    return dist
  }
  if (n.min != null || n.max != null) {
    const a = single(distOf(n.min ?? 0, int))
    const b = single(distOf(n.max ?? a, int))
    if (!int || !Number.isInteger(a) || !Number.isInteger(b) || b < a) throw new Unsupported()
    const dist: Dist = new Map()
    for (let v = a; v <= b; v++) dist.set(v, 1 / (b - a + 1))
    return dist
  }
  return new Map([ [ n.value ?? 1, 1 ] ])
}

function mapDist(dist: Dist, fn: (v: number) => number) {
  const out: Dist = new Map()
  for (const [ v, p ] of dist) addTo(out, fn(v), p)
  return out
}

function testOdds(c: any): { t: number, f: number } {
  const type = typeOf(c)
  if (type === 'all_of') {
    const terms = asList(c.terms).map(testOdds)
    return { t: terms.reduce((a, x) => a * x.t, 1), f: 1 - terms.reduce((a, x) => a * (1 - x.f), 1) }
  }
  if (type === 'any_of') {
    const terms = asList(c.terms).map(testOdds)
    return { t: 1 - terms.reduce((a, x) => a * (1 - x.t), 1), f: terms.reduce((a, x) => a * x.f, 1) }
  }
  if (type === 'inverted') {
    const inner = testOdds(c.term ?? c.terms)
    return { t: inner.f, f: inner.t }
  }
  if (type in TOOLS) return { t: 0, f: 1 }
  const chance = conditionChance(c)
  if (chance !== null) {
    const p = Math.min(1, Math.max(0, single(distOf(chance))))
    return { t: p, f: 1 - p }
  }
  return { t: 0, f: 0 }
}

function passChance(node: any) {
  return conditionsOf(node).reduce((a, c) => a * (1 - testOdds(c).f), 1)
}

function applyFunction(f: any, v: Variant): Variant[] {
  const t = typeOf(f)
  if (t === 'set_count') return [ { ...v, counts: mapDist(distOf(f.count, true), c => Math.max(1, Math.round(c))) } ]
  if (t === 'set_data') return Array.from(distOf(f.data, true), ([ d, p ]) => ({ ...v, id: legacyVariant(v.id, Math.round(d)), p: v.p * p }))
  if (t === 'set_potion') return [ { ...v, components: { 'minecraft:potion_contents': { potion: f.id } } } ]
  if (t === 'set_components') return [ { ...v, components: { ...v.components, ...f.components } } ]
  return [ v ]
}

function itemOutcome(entry: any, pool: any, via?: string): Outcome {
  let variants: Variant[] = [ { id: legacyVariant(strip(entry.name)), p: 1, counts: new Map([ [ 1, 1 ] ]) } ]
  for (const f of functionsOf(entry).concat(functionsOf(pool))) {
    const c = passChance(f)
    if (c === 0) continue
    const applied = variants.flatMap(v => applyFunction(f, v))
    variants = c === 1 ? applied : applied.map(v => ({ ...v, p: v.p * c })).concat(variants.map(v => ({ ...v, p: v.p * (1 - c) })))
  }
  const out: Outcome = new Map()
  for (const v of variants) {
    if (!v.id || v.p === 0) continue
    const k = stackKey(v)
    if (!out.has(k)) out.set(k, { id: v.id, components: v.components, zero: 1, stacks: 0, total: 0, min: Infinity, max: 0, via: new Set(via ? [ via ] : []) })
    const o = out.get(k)!
    o.zero -= v.p
    o.stacks += v.p
    for (const [ count, p ] of v.counts) {
      if (p === 0) continue
      o.total += v.p * p * count
      o.min = Math.min(o.min, count)
      o.max = Math.max(o.max, count)
    }
  }
  return out
}

function blank(o: ItemOutcome): ItemOutcome {
  return { id: o.id, components: o.components, zero: 1, stacks: 0, total: 0, min: Infinity, max: 0, via: new Set() }
}

function merge(target: ItemOutcome, o: ItemOutcome) {
  target.min = Math.min(target.min, o.min)
  target.max = Math.max(target.max, o.max)
  for (const v of o.via) target.via.add(v)
}

function mix(parts: [ number, Outcome ][]): Outcome {
  const out: Outcome = new Map()
  for (const [ p, outcome ] of parts) {
    if (p === 0) continue
    for (const [ k, o ] of outcome) {
      if (!out.has(k)) out.set(k, blank(o))
      const m = out.get(k)!
      m.zero -= p * (1 - o.zero)
      m.stacks += p * o.stacks
      m.total += p * o.total
      merge(m, o)
    }
  }
  return out
}

function combine(parts: Outcome[]): Outcome {
  const out: Outcome = new Map()
  for (const outcome of parts) {
    for (const [ k, o ] of outcome) {
      if (!out.has(k)) out.set(k, blank(o))
      const m = out.get(k)!
      m.zero *= o.zero
      m.stacks += o.stacks
      m.total += o.total
      merge(m, o)
    }
  }
  return out
}

function repeat(outcome: Outcome, times: Dist): Outcome {
  const mean = Array.from(times).reduce((a, [ n, p ]) => a + n * p, 0)
  const out: Outcome = new Map()
  for (const [ k, o ] of outcome) {
    const zero = Array.from(times).reduce((a, [ n, p ]) => a + p * o.zero ** n, 0)
    out.set(k, { ...o, zero, stacks: o.stacks * mean, total: o.total * mean })
  }
  return out
}

class Calculator {
  #tables: Map<string, any>
  #open = new Set<string>()

  constructor(tables: Map<string, any>) {
    this.#tables = tables
  }

  #entry(entry: any, pool: any, via?: string): Outcome {
    const type = strip(entry.type || 'item')
    if (type === 'item') return itemOutcome(entry, pool, via)
    if (type === 'loot_table') {
      const ref = entry.value ?? entry.name
      if (typeof ref === 'object') return this.table(ref, via)
      const t = this.#tables.get(ref)
      if (!t) return new Map()
      if (this.#open.has(ref)) throw new Unsupported()
      this.#open.add(ref)
      try {
        return this.table(t, strip(ref))
      } finally {
        this.#open.delete(ref)
      }
    }
    if (type === 'group' || type === 'sequence') return combine((entry.children ?? []).map((c: any) => this.#entry(c, pool, via)))
    if (type === 'alternatives') {
      let reach = 1
      return mix((entry.children ?? []).map((c: any) => {
        const pass = passChance(c)
        const p = reach * pass
        reach *= 1 - pass
        return [ p, this.#entry(c, pool, via) ]
      }))
    }
    return new Map()
  }

  #roll(pool: any, via?: string): Outcome {
    const entries: any[] = pool.entries ?? []
    const pass = entries.map(passChance)
    const random = entries.map((_, i) => i).filter(i => pass[i] > 0 && pass[i] < 1)
    if (random.length > 10) throw new Unsupported()
    const picked = entries.map(() => 0)
    for (let mask = 0; mask < 1 << random.length; mask++) {
      let p = 1
      const usable = new Set(entries.map((_, i) => i).filter(i => pass[i] === 1))
      random.forEach((i, bit) => {
        if (mask >> bit & 1) {
          p *= pass[i]
          usable.add(i)
        } else p *= 1 - pass[i]
      })
      const total = Array.from(usable).reduce((a, i) => a + (entries[i].weight ?? 1), 0)
      if (total <= 0) continue
      for (const i of usable) picked[i] += p * (entries[i].weight ?? 1) / total
    }
    return mix(entries.map((e, i) => [ picked[i], picked[i] ? this.#entry(e, pool, via) : new Map() ]))
  }

  table(table: any, via?: string): Outcome {
    return combine((table.pools ?? []).map((pool: any) => {
      const q = passChance(pool)
      const rolls = mapDist(distOf(pool.rolls ?? 1, true), Math.round)
      const times: Dist = new Map([ [ 0, 1 - q ] ])
      for (const [ n, p ] of rolls) addTo(times, n, q * p)
      return repeat(this.#roll(pool, via), times)
    }))
  }
}

function sortOdds(odds: LootOdds[]) {
  return odds.sort((a, b) => b.chance - a.chance || strip(a.id).localeCompare(strip(b.id)))
}

export async function exactTable(table: any, read: TableReader): Promise<LootOdds[]> {
  const outcome = new Calculator(await collectTables(table, read)).table(table)
  return sortOdds(Array.from(outcome.values()).filter(o => o.stacks > 0 && o.zero < 1).map(o => ({
    id: o.id,
    components: o.components,
    chance: 1 - o.zero,
    avg: o.total / o.stacks,
    min: o.min,
    max: o.max,
    via: Array.from(o.via).sort(),
  })))
}

export async function sampleTable(
  table: any,
  read: TableReader,
  opens = 10000,
): Promise<LootOdds[]> {
  const roller = new Roller(await collectTables(table, read), 0x10770741)
  const tally = new Map<string, {
    id: string
    components?: Record<string, any>
    hits: number
    stacks: number
    total: number
    min: number
    max: number
    via: Set<string>
  }>()
  const seen = new Set<string>()
  let lastYield = performance.now()
  for (let i = 0; i < opens; i++) {
    if ((i & 511) === 0 && performance.now() - lastYield > 12) {
      await new Promise(resolve => setTimeout(resolve))
      lastYield = performance.now()
    }
    seen.clear()
    const out: LootStack[] = []
    roller.rollInto(table, out)
    for (const s of out) {
      if (!s.id) continue
      const k = stackKey(s)
      if (!tally.has(k)) {
        tally.set(k, { id: s.id, components: s.components, hits: 0, stacks: 0, total: 0, min: Infinity, max: 0, via: new Set() })
      }
      const t = tally.get(k)!
      if (s.via) t.via.add(s.via)
      if (!seen.has(k)) t.hits++
      seen.add(k)
      t.stacks++
      t.total += s.count
      t.min = Math.min(t.min, s.count)
      t.max = Math.max(t.max, s.count)
    }
  }
  return sortOdds(Array.from(tally.values()).map(t => ({
    id: t.id,
    components: t.components,
    chance: t.hits / opens,
    avg: t.total / t.stacks,
    min: t.min,
    max: t.max,
    via: Array.from(t.via).sort(),
  })))
}

export async function tableOdds(table: any, read: TableReader): Promise<LootOdds[]> {
  try {
    return await exactTable(table, read)
  } catch (e) {
    if (!(e instanceof Unsupported)) throw e
    return sampleTable(table, read)
  }
}

// read at zero enchantment levels, the only assumption available outside a world
function conditionChance(c: any) {
  const type = typeOf(c)
  if (type === 'random_chance' || type === 'random_chance_with_looting') return c.chance ?? 1
  if (type === 'random_chance_with_enchanted_bonus') return c.unenchanted_chance ?? 1
  if (type === 'table_bonus') return c.chances?.[0] ?? 1
  return null
}

function toolName(c: any) {
  const type = typeOf(c)
  if (type !== 'match_tool') return TOOLS[type]
  const predicate = JSON.stringify(c?.predicate ?? '')
  if (predicate.includes('silk_touch')) return TOOLS['tool/can_silk_touch']
  if (predicate.includes('shears')) return TOOLS['tool/can_shear']
  return TOOLS[type]
}

export function toolGate(table: any): string | null {
  let found: string | null = null
  const walk = (node: any) => {
    if (found) return;
    for (const c of asList(node)) {
      if (typeOf(c) in TOOLS) {
        found = toolName(c)
        return;
      }
      walk(c?.terms ?? c?.term)
    }
  }
  const visit = (node: any) => {
    walk(conditionsOf(node))
    for (const child of asList(node?.pools).concat(asList(node?.entries), asList(node?.children))) visit(child)
  }
  visit(table)
  return found
}

function chanceTerms(c: any, out: any[] = []): any[] {
  if (typeOf(c) === 'all_of') {
    for (const term of asList(c.terms)) chanceTerms(term, out)
    return out
  }
  const chance = conditionChance(c)
  if (chance !== null) out.push(chance)
  return out
}

function entryKind(e: any): Pick<LootRuleEntry, 'kind' | 'id'> {
  const type = strip(e.type || 'item')
  if (type === 'item') return { kind: 'item', id: e.name ?? 'unknown' }
  if (type === 'loot_table') {
    const ref = e.value ?? e.name
    return typeof ref === 'string' ? { kind: 'table', id: ref } : { kind: 'other', id: 'inline table' }
  }
  if (type === 'tag') return { kind: 'tag', id: e.name ?? 'unknown' }
  if (type === 'dynamic') return { kind: 'dynamic', id: e.name ?? 'unknown' }
  return { kind: 'other', id: type }
}

const oddsCache = new WeakMap<object, Promise<LootOdds[]>>()

export function tableOddsCached(table: any, read: TableReader): Promise<LootOdds[]> {
  if (table === null || typeof table !== 'object') return tableOdds(table, read)
  if (!oddsCache.has(table)) oddsCache.set(table, tableOdds(table, read))
  return oddsCache.get(table)!
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

export function sameOdds(a: LootOdds, b: LootOdds) {
  return near(a.chance, b.chance) && a.min === b.min && a.max === b.max && near(a.avg, b.avg)
    && a.via.join(', ') === b.via.join(', ')
}

export function oddsChanged(before: LootOdds[], after: LootOdds[]) {
  if (before.length !== after.length) return true
  const byKey = new Map(after.map(o => [ stackKey(o), o ]))
  return before.some(o => {
    const match = byKey.get(stackKey(o))
    return !match || !sameOdds(o, match)
  })
}

function fmtNum(n: any): string {
  if (n == null) return '1'
  if (typeof n === 'number') return String(n)
  const t = strip(n.type || '')
  if (t === 'constant') return String(n.value ?? 1)
  if (t === 'binomial') return `binomial(${fmtNum(n.n)} tries, ${fmtNum(n.p)})`
  if (n.min != null || n.max != null) return `${fmtNum(n.min ?? 0)}-${fmtNum(n.max ?? '?')}`
  return String(n.value ?? 1)
}

export function describeTable(table: any): LootRulePool[] {
  return (table.pools ?? []).map((pool: any) => {
    const entries = pool.entries ?? []
    const total = entries.reduce((a: number, e: any) => a + (e.weight ?? 1), 0) || 1
    const chance = conditionsOf(pool).flatMap((c: any) => chanceTerms(c))[0]
    return {
      rolls: fmtNum(pool.rolls ?? 1),
      bonus: pool.bonus_rolls ? fmtNum(pool.bonus_rolls) : null,
      chance: chance != null ? Math.round(Number(fmtNum(chance)) * 100) + '% chance' : null,
      entries: entries.map((e: any) => {
        const fns = functionsOf(e)
        const sc = fns.find((f: any) => typeOf(f) === 'set_count')
        const notes: string[] = []
        for (const f of fns) {
          const fn = typeOf(f)
          if (fn === 'enchant_randomly') notes.push('enchanted')
          else if (fn === 'enchant_with_levels') notes.push(`enchanted, ${fmtNum(f.levels)} levels`)
          else if (fn === 'set_potion') notes.push(strip(f.id))
          else if (fn === 'exploration_map') notes.push('treasure map')
          else if (fn === 'set_instrument') notes.push('random instrument')
          else if (fn === 'set_damage') notes.push('damaged')
          else if (fn === 'set_stew_effect') notes.push('random effect')
          else if (fn === 'set_data') notes.push(`data ${fmtNum(f.data)}`)
          else if (fn === 'furnace_smelt') notes.push('smelted')
        }
        return {
          ...entryKind(e),
          pct: +((e.weight ?? 1) / total * 100).toFixed(1),
          count: sc ? fmtNum(sc.count) : null,
          note: notes.join(', '),
        }
      }),
    }
  })
}
