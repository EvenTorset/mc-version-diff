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

export const stackKey = (s: LootStack | LootOdds) =>
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
    total: number
    min: number
    max: number
    via: Set<string>
  }>()
  const perOpen = new Map<string, number>()
  let lastYield = performance.now()
  for (let i = 0; i < opens; i++) {
    if ((i & 511) === 0 && performance.now() - lastYield > 12) {
      await new Promise(resolve => setTimeout(resolve))
      lastYield = performance.now()
    }
    perOpen.clear()
    const out: LootStack[] = []
    roller.rollInto(table, out)
    for (const s of out) {
      if (!s.id) continue
      const k = stackKey(s)
      perOpen.set(k, (perOpen.get(k) ?? 0) + s.count)
      if (!tally.has(k)) {
        tally.set(k, { id: s.id, components: s.components, hits: 0, total: 0, min: Infinity, max: 0, via: new Set() })
      }
      if (s.via) tally.get(k)!.via.add(s.via)
    }
    for (const [ k, count ] of perOpen) {
      const t = tally.get(k)!
      t.hits++
      t.total += count
      t.min = Math.min(t.min, count)
      t.max = Math.max(t.max, count)
    }
  }
  return Array.from(tally.values()).map(t => ({
    id: t.id,
    components: t.components,
    chance: t.hits / opens,
    avg: t.total / t.hits,
    min: t.min,
    max: t.max,
    via: Array.from(t.via).sort(),
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

export function sampleTableCached(table: any, read: TableReader): Promise<LootOdds[]> {
  if (table === null || typeof table !== 'object') return sampleTable(table, read)
  if (!oddsCache.has(table)) oddsCache.set(table, sampleTable(table, read))
  return oddsCache.get(table)!
}

export function sameOdds(a: LootOdds, b: LootOdds) {
  return a.chance === b.chance && a.min === b.min && a.max === b.max && a.avg === b.avg
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
