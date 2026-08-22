export type ProgressUpdate = {
  ratio: number,
  current: number,
  total: number,
  message: string,
  unit: string,
}

export type ProgressHandlerFunc = (progress: ProgressUpdate) => void

export class ProgressHandler {
  #message: string = 'Initializing...'
  #ratio: number = 0
  #current: number = 0
  #total: number = 0
  #unit: string = ''
  constructor(private func: ProgressHandlerFunc) {
    this.#send()
  }

  #send() {
    this.func({
      ratio: this.#ratio,
      current: this.#current,
      total: this.#total,
      message: this.#message,
      unit: this.#unit,
    })
  }

  update(ratio: number, current: number, total: number) {
    this.#ratio = ratio
    this.#current = current
    this.#total = total
    this.#send()
  }

  setMessage(value: string) {
    this.#message = value
    this.#send()
  }

  setUnit(value: string) {
    this.#unit = value
    this.#send()
  }
}
