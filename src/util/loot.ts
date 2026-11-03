import type { DeltaResult } from '@/delta_providers'
import { legacyVariant } from '@/util/legacyItems'

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

const clampChance = (p: number) => Math.min(1, Math.max(0, p))

function average(g: (x: number) => number, a: number, b: number) {
  const stops = [ a ].concat([ 0, 1 ].filter(x => x > a && x < b), b)
  let sum = 0
  for (let i = 1; i < stops.length; i++) {
    const h = (stops[i] - stops[i - 1]) / 32
    for (let j = 0; j <= 32; j++) sum += g(stops[i - 1] + j * h) * h / 3 * (j === 0 || j === 32 ? 1 : j % 2 ? 4 : 2)
  }
  return sum / (b - a)
}

function expectFloat(n: any, g: (x: number) => number): number {
  if (n == null) return g(1)
  if (typeof n === 'number') return g(n)
  const t = strip(n.type || '')
  if (t === 'constant') return g(n.value ?? 1)
  if (t === 'binomial') return Array.from(intDist(n)).reduce((sum, [ v, p ]) => sum + p * g(v), 0)
  if (n.min != null || n.max != null) {
    return expectFloat(n.min ?? 0, a => expectFloat(n.max ?? a, b => a >= b ? g(a) : average(g, a, b)))
  }
  return g(n.value ?? 1)
}

function intDist(n: any): Dist {
  if (n == null) return new Map([ [ 1, 1 ] ])
  if (typeof n === 'number') return new Map([ [ Math.round(n), 1 ] ])
  const t = strip(n.type || '')
  if (t === 'constant') return new Map([ [ Math.round(n.value ?? 1), 1 ] ])
  const dist: Dist = new Map()
  if (t === 'binomial') {
    for (const [ tries, weight ] of intDist(n.n)) {
      const N = Math.max(0, tries)
      let choose = 1
      for (let k = 0; k <= N; k++) {
        addTo(dist, k, weight * choose * expectFloat(n.p, p => clampChance(p) ** k * (1 - clampChance(p)) ** (N - k)))
        choose = choose * (N - k) / (k + 1)
      }
    }
    return dist
  }
  if (n.min != null || n.max != null) {
    for (const [ a, pa ] of intDist(n.min ?? 0)) {
      for (const [ b, pb ] of intDist(n.max ?? a)) {
        if (a >= b) addTo(dist, a, pa * pb)
        else for (let v = a; v <= b; v++) addTo(dist, v, pa * pb / (b - a + 1))
      }
    }
    return dist
  }
  return new Map([ [ Math.round(n.value ?? 1), 1 ] ])
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
    const p = expectFloat(chance, clampChance)
    return { t: p, f: 1 - p }
  }
  return { t: 0, f: 0 }
}

function passChance(node: any) {
  return conditionsOf(node).reduce((a, c) => a * (1 - testOdds(c).f), 1)
}

function applyFunction(f: any, v: Variant): Variant[] {
  const t = typeOf(f)
  if (t === 'set_count') {
    if (!f.add) return [ { ...v, counts: intDist(f.count) } ]
    const counts: Dist = new Map()
    for (const [ base, p ] of v.counts) {
      for (const [ extra, q ] of intDist(f.count)) addTo(counts, base + extra, p * q)
    }
    return [ { ...v, counts } ]
  }
  if (t === 'set_data') return Array.from(intDist(f.data), ([ d, p ]) => ({ ...v, id: legacyVariant(v.id, d), p: v.p * p }))
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
    for (const [ count, p ] of v.counts) {
      if (p === 0 || count <= 0) continue
      o.zero -= v.p * p
      o.stacks += v.p * p
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
      if (this.#open.has(ref)) throw new Error(`Loot table ${ref} is recursively called`)
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
    const weight = (i: number) => entries[i].weight ?? 1
    const random = entries.map((_, i) => i).filter(i => pass[i] > 0 && pass[i] < 1)
    const fixed = entries.reduce((a, _, i) => pass[i] === 1 ? a + weight(i) : a, 0)
    function totalsWithout(skip: number) {
      let totals: Dist = new Map([ [ fixed, 1 ] ])
      for (const i of random) {
        if (i === skip) continue
        const next: Dist = new Map()
        for (const [ w, p ] of totals) {
          addTo(next, w, p * (1 - pass[i]))
          addTo(next, w + weight(i), p * pass[i])
        }
        totals = next
      }
      return totals
    }
    const picked = entries.map((_, i) => {
      if (pass[i] === 0) return 0
      const own = pass[i] === 1 ? 0 : weight(i)
      let p = 0
      for (const [ w, chance ] of totalsWithout(pass[i] === 1 ? -1 : i)) {
        if (w + own > 0) p += chance * weight(i) / (w + own)
      }
      return pass[i] * p
    })
    return mix(entries.map((e, i) => [ picked[i], picked[i] ? this.#entry(e, pool, via) : new Map() ]))
  }

  table(table: any, via?: string): Outcome {
    return combine((table.pools ?? []).map((pool: any) => {
      const q = passChance(pool)
      const rolls = mapDist(intDist(pool.rolls ?? 1), n => Math.max(0, n))
      const times: Dist = new Map([ [ 0, 1 - q ] ])
      for (const [ n, p ] of rolls) addTo(times, n, q * p)
      return repeat(this.#roll(pool, via), times)
    }))
  }
}

export async function tableOdds(table: any, read: TableReader): Promise<LootOdds[]> {
  const outcome = new Calculator(await collectTables(table, read)).table(table)
  return Array.from(outcome.values()).filter(o => o.stacks > 0 && o.zero < 1).map(o => ({
    id: o.id,
    components: o.components,
    chance: 1 - o.zero,
    avg: o.total / o.stacks,
    min: o.min,
    max: o.max,
    via: Array.from(o.via).sort(),
  })).sort((a, b) => b.chance - a.chance || strip(a.id).localeCompare(strip(b.id)))
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
