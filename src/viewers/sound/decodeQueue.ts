const MAX_RUNNING = 1

const queues: (() => void)[][] = [[], []]
let running = 0

function pump() {
  while (running < MAX_RUNNING) {
    const next = queues[0].shift() ?? queues[1].shift()
    if (!next) return;
    running++
    next()
  }
}

export function queueDecode<T>(priority: 0 | 1, task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queues[priority].push(() => {
      task().then(resolve, reject).finally(() => {
        running--
        pump()
      })
    })
    pump()
  })
}

let fills = 0

export function beginFill() {
  fills++
}

export function endFill() {
  fills--
}

export function fillCount(): number {
  return fills
}
