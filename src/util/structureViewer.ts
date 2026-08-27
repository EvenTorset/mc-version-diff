export type Bytes = ArrayBuffer | Uint8Array | Blob | File

const SOURCE = "structure-viewer" as const
export type Source = typeof SOURCE

export type BaseSource =
  | string
  | Bytes
  | { handler: string }
  | null

export type PackEntry =
  | string
  | Bytes
  | { name?: string; data: Bytes }
  | { handler: string; name?: string }

export interface LoadPacksArgs {
  base?: BaseSource
  packs?: PackEntry[]
}

export type LoadPacksResult = Record<string, never>

export type LoadStructureArgs =
  | { data: Bytes; name?: string; path?: never }
  | { path: string; data?: never; name?: never }

export type LoadStructureResult = Record<string, never>

export interface ListStructuresArgs {
  filter?: string
}

export interface ListStructuresResult {
  names: string[]
}

export type ChunkCoord = [x: number, z: number]

export type ChunkSelector = ChunkCoord[]

export interface WorldBounds {
  minCx: number
  maxCx: number
  minCz: number
  maxCz: number
}

export interface LoadWorldArgs {
  data?: Bytes
  name?: string
  dimension?: string
  chunks?: ChunkSelector
  y?: [min: number, max: number]
  force?: boolean
}

export interface LoadWorldResult {
  chunks: number
  dimensions: string[]
  bounds: WorldBounds | null
}

export interface LoadComparePacksArgs {
  base?: BaseSource
  packs?: PackEntry[]
}

export interface LoadComparePacksResult {
  armed: boolean
  version: string | null
}

export type CompareFile = Bytes | { data: Bytes; name?: string }

export type CompareView = "slide" | "before" | "after"

export interface CompareViewArgs {
  show?: { added?: boolean; changed?: boolean; removed?: boolean }
  view?: CompareView
  split?: number
}

export type CompareArgs = CompareViewArgs & (
  | { path: string }
  | { left?: CompareFile; right?: CompareFile }
  | { against: string; path?: string }
  | { off: true }
  | {}
)

export interface CompareResult {
  on: boolean
  counts: { added: number; changed: number; removed: number }
}

export interface CommandMap {
  loadPacks: { args: LoadPacksArgs; result: LoadPacksResult }
  loadStructure: { args: LoadStructureArgs; result: LoadStructureResult }
  listStructures: { args: ListStructuresArgs; result: ListStructuresResult }
  loadWorld: { args: LoadWorldArgs; result: LoadWorldResult }
  loadComparePacks: { args: LoadComparePacksArgs; result: LoadComparePacksResult }
  compare: { args: CompareArgs; result: CompareResult }
}

export type CommandType = keyof CommandMap

export type CommandMessage =
  | ({ source: Source; type: "loadPacks"; id?: number } & LoadPacksArgs)
  | ({ source: Source; type: "loadStructure"; id?: number } & LoadStructureArgs)
  | ({ source: Source; type: "listStructures"; id?: number } & ListStructuresArgs)
  | ({ source: Source; type: "loadWorld"; id?: number } & LoadWorldArgs)
  | ({ source: Source; type: "loadComparePacks"; id?: number } & LoadComparePacksArgs)
  | ({ source: Source; type: "compare"; id?: number } & CompareArgs)

export type ReplyMessage =
  | ({ source: Source; reply: number; ok: true } & Partial<
      LoadPacksResult & LoadStructureResult & ListStructuresResult & LoadWorldResult &
        LoadComparePacksResult & CompareResult
    >)
  | { source: Source; reply: number; ok: false; error: string }

export type EventName = "ready"

export interface EventMessage {
  source: Source
  event: EventName
}

export type AssetOp = "read" | "list"

export interface AssetRequestMessage {
  source: Source
  request: number
  handler: string
  op: AssetOp
  path: string
}

export type AssetResponseMessage =
  | { source: Source; response: number; data: Bytes | null }
  | { source: Source; response: number; names: string[] }
  | { source: Source; response: number; error: string }

export type IncomingMessage = ReplyMessage | EventMessage | AssetRequestMessage

export interface VirtualHandler {
  read(path: string): Promise<Bytes | null | undefined>
  list(path: string): Promise<string[]>
}

export class StructureViewerEmbed {
  #frame: HTMLIFrameElement
  #nextId = 1
  #pending = new Map<number, (msg: ReplyMessage) => void>()
  #handlers = new Map<string, VirtualHandler>()
  #onReady?: () => void
  #boundListener: (event: MessageEvent) => void

  constructor(frame: HTMLIFrameElement) {
    this.#frame = frame
    this.#boundListener = this.#handleMessage.bind(this)
    addEventListener("message", this.#boundListener)
  }

  registerHandler(id: string, handler: VirtualHandler) {
    this.#handlers.set(id, handler)
  }

  ready(): Promise<void> {
    return new Promise(resolve => {
      this.#onReady = resolve
    })
  }

  send<T extends CommandType>(
    type: T,
    args: CommandMap[T]["args"],
    transfer?: Transferable[]
  ): Promise<CommandMap[T]["result"]> {
    const id = this.#nextId++
    const message = { source: SOURCE, type, id, ...args } as CommandMessage
    const promise = new Promise<CommandMap[T]["result"]>((resolve, reject) => {
      this.#pending.set(id, reply => {
        if (reply.ok) resolve(reply as unknown as CommandMap[T]["result"])
        else reject(new Error(reply.error))
      })
    })
    this.#frame.contentWindow?.postMessage(message, "*", transfer)
    return promise
  }

  destroy() {
    removeEventListener("message", this.#boundListener)
  }

  #handleMessage(event: MessageEvent) {
    const data = event.data
    if (data?.source !== SOURCE) return;

    if (typeof data.reply === "number") {
      const settle = this.#pending.get(data.reply)
      if (settle) {
        this.#pending.delete(data.reply)
        settle(data as ReplyMessage)
      }
      return;
    }

    if (data.event === "ready") {
      this.#onReady?.()
      return;
    }

    if (typeof data.request === "number") {
      this.#answerAssetRequest(data as AssetRequestMessage, event.origin)
    }
  }

  async #answerAssetRequest(msg: AssetRequestMessage, origin: string) {
    const target = origin === "null" ? "*" : origin
    const handler = this.#handlers.get(msg.handler)
    if (!handler) {
      this.#frame.contentWindow?.postMessage(
        { source: SOURCE, response: msg.request, error: `no handler registered: ${msg.handler}` },
        target
      )
      return;
    }
    try {
      if (msg.op === "read") {
        const data = (await handler.read(msg.path)) ?? null
        this.#frame.contentWindow?.postMessage({ source: SOURCE, response: msg.request, data }, target)
      } else {
        const names = await handler.list(msg.path)
        this.#frame.contentWindow?.postMessage({ source: SOURCE, response: msg.request, names }, target)
      }
    } catch (err) {
      this.#frame.contentWindow?.postMessage(
        { source: SOURCE, response: msg.request, error: String((err as Error)?.message ?? err) },
        target
      )
    }
  }
}
