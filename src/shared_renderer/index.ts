import type { ImageViewMode } from '@/types'
import type { RenderTask, WorkerRenderMessage } from './render.worker'
import RenderWorker from './render.worker?worker'

class RenderWorkerPool {
  private workers: Worker[] = []
  private idleWorkers: Worker[] = []
  private queue: Array<{
    task: RenderTask
    resolve: (val: ImageBitmap) => void
    reject: (err: any) => void
  }> = []
  private pendingTasks = new Map<number, { resolve: (val: ImageBitmap) => void; reject: (err: any) => void }>()
  private nextId = 0

  constructor(maxWorkers = Math.max(1, (navigator.hardwareConcurrency || 4) - 1)) {
    for (let i = 0; i < maxWorkers; i++) {
      const worker = new RenderWorker()
      worker.onmessage = (event: MessageEvent<WorkerRenderMessage>) => {
        const { id, bitmap, error } = event.data
        const task = this.pendingTasks.get(id)
        if (task) {
          this.pendingTasks.delete(id)
          if (error) {
            task.reject(new Error(error))
          } else if (bitmap) {
            task.resolve(bitmap)
          }
        }
        this.idleWorkers.push(worker)
        this.drainQueue()
      }
      this.workers.push(worker)
      this.idleWorkers.push(worker)
    }
  }

  async run(task: RenderTask): Promise<ImageBitmap> {
    const clonedBitmap = await createImageBitmap(task.bitmap, {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    })
    const taskWithClone = { ...task, bitmap: clonedBitmap }

    return new Promise((resolve, reject) => {
      this.queue.push({ task: taskWithClone, resolve, reject })
      this.drainQueue()
    })
  }

  private drainQueue() {
    while (this.queue.length > 0 && this.idleWorkers.length > 0) {
      const worker = this.idleWorkers.pop()!
      const { task, resolve, reject } = this.queue.shift()!
      const id = ++this.nextId

      this.pendingTasks.set(id, { resolve, reject })

      worker.postMessage(
        { id, ...task },
        [task.bitmap],
      )
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

let RENDER_POOL: RenderWorkerPool | null = null

function getRenderPool() {
  if (RENDER_POOL === null) {
    RENDER_POOL = new RenderWorkerPool()
  }
  return RENDER_POOL
}

export function renderImageWithMode(
  bitmap: ImageBitmap,
  mode: ImageViewMode,
  width: number,
  height: number,
): Promise<ImageBitmap> {
  return getRenderPool().run({ bitmap, mode, width, height })
}

export function terminateRenderWorkers() {
  if (RENDER_POOL !== null) {
    RENDER_POOL.terminate()
    RENDER_POOL = null
  }
}
