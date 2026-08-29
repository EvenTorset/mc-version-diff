import type { WorkerCompareMessage, CompareTask, CompareItem, BatchTask } from './cmp.worker'
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

const MAX_BATCH = 32

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
        for (const { id, same, error } of event.data.results) {
          const task = this.pendingTasks.get(id)
          if (task) {
            this.pendingTasks.delete(id)
            if (error) {
              task.reject(new Error(error))
            } else {
              task.resolve(same)
            }
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
      const batch = this.queue.splice(0, Math.min(
        MAX_BATCH,
        Math.max(1, Math.ceil(this.queue.length / this.workers.length))
      ))

      let total = 0
      for (const { task } of batch) {
        total += task.a.compressedContent.byteLength + task.b.compressedContent.byteLength
      }

      const data = new Uint8Array(total)
      const tasks: BatchTask[] = []
      let offset = 0

      for (const { task, resolve, reject } of batch) {
        const id = ++this.nextId
        this.pendingTasks.set(id, { resolve, reject })

        const aOffset = offset
        data.set(task.a.compressedContent, offset)
        offset += task.a.compressedContent.byteLength

        const bOffset = offset
        data.set(task.b.compressedContent, offset)
        offset += task.b.compressedContent.byteLength

        tasks.push({
          id,
          kind: task.kind,
          littleEndian: task.kind === 'nbt' ? task.littleEndian : undefined,
          aOffset,
          aLength: task.a.compressedContent.byteLength,
          aMethod: task.a.compressionMethod,
          bOffset,
          bLength: task.b.compressedContent.byteLength,
          bMethod: task.b.compressionMethod,
        })
      }

      worker.postMessage({ tasks, data: data.buffer }, [data.buffer])
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
