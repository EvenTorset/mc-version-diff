import type { WorkerCompareMessage, CompareTask, CompareItem } from './cmp.worker'
import CmpWorker from './cmp.worker?worker'

export class HashEquivalence {
  private groups = new Map<number, Set<number>>()

  areEquivalent(hashA: number, hashB: number): boolean {
    if (hashA === hashB) return true
    const groupA = this.groups.get(hashA)
    return groupA ? groupA.has(hashB) : false
  }

  /** Every hash equivalent to this one, including itself. */
  group(hash: number): Iterable<number> {
    return this.groups.get(hash) ?? [hash]
  }

  markEquivalent(hashA: number, hashB: number): void {
    if (hashA === hashB) return;

    const setA = this.groups.get(hashA)
    const setB = this.groups.get(hashB)

    if (!setA && !setB) {
      const newSet = new Set([hashA, hashB])
      this.groups.set(hashA, newSet)
      this.groups.set(hashB, newSet)
    } else if (setA && !setB) {
      setA.add(hashB)
      this.groups.set(hashB, setA)
    } else if (!setA && setB) {
      setB.add(hashA)
      this.groups.set(hashA, setB)
    } else if (setA && setB && setA !== setB) {
      for (const hash of setB) {
        setA.add(hash)
        this.groups.set(hash, setA)
      }
    }
  }
}

class WorkerPool {
  private workers: Worker[] = []
  private idleWorkers: Worker[] = []
  private queue: Array<{
    task: CompareTask
    resolve: (val: boolean) => void
    reject: (err: any) => void
  }> = []
  private pendingTasks = new Map<number, { resolve: (val: boolean) => void; reject: (err: any) => void }>()
  private nextId = 0

  constructor(maxWorkers = (navigator.hardwareConcurrency || 4) - 1) {
    for (let i = 0; i < maxWorkers; i++) {
      const worker = new CmpWorker()
      worker.onmessage = (event: MessageEvent<WorkerCompareMessage>) => {
        const { id, same, error } = event.data
        const task = this.pendingTasks.get(id)
        if (task) {
          this.pendingTasks.delete(id)
          if (error) {
            task.reject(new Error(error))
          } else {
            task.resolve(same)
          }
        }
        this.idleWorkers.push(worker)
        this.drainQueue()
      }
      this.workers.push(worker)
      this.idleWorkers.push(worker)
    }
  }

  run(task: CompareTask): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject })
      this.drainQueue()
    })
  }

  private drainQueue() {
    while (this.queue.length > 0 && this.idleWorkers.length > 0) {
      const worker = this.idleWorkers.pop()!
      const { task, resolve, reject } = this.queue.shift()!
      const id = ++this.nextId

      this.pendingTasks.set(id, { resolve, reject })

      const bufA = task.a.compressedContent.slice().buffer
      const bufB = task.b.compressedContent.slice().buffer

      const message = {
        id,
        ...task,
        a: { ...task.a, compressedContent: new Uint8Array(bufA) },
        b: { ...task.b, compressedContent: new Uint8Array(bufB) },
      }

      worker.postMessage(message, [bufA, bufB])
    }
  }

  terminate() {
    for (const worker of this.workers) {
      worker.terminate()
    }
    this.workers = []
    this.idleWorkers = []
    this.pendingTasks.clear()
    this.queue = []
  }
}

let POOL: WorkerPool | null = null

function getPool() {
  if (POOL === null) {
    POOL = new WorkerPool()
  }
  return POOL
}

export function terminateCmpWorkers() {
  if (POOL !== null) {
    POOL.terminate()
    POOL = null
  }
}

export function comparePng(a: CompareItem, b: CompareItem): Promise<boolean> {
  return getPool().run({ kind: 'png', a, b })
}

export function compareNbt(
  a: CompareItem,
  b: CompareItem,
  options?: { littleEndian?: boolean }
): Promise<boolean> {
  return getPool().run({ kind: 'nbt', a, b, littleEndian: options?.littleEndian })
}
