/**
 * A dependency-free NBT reader.
 *
 * Supports both endiannesses (Java is big-endian, Bedrock little-endian) and
 * transparently decompresses gzip and zlib streams.
 *
 * @example
 * ```ts
 * const data = await readNbt(await file.arrayBuffer())
 * ```
 */

/** Numeric ids of the thirteen NBT tag types. */
export const TagType = {
  End: 0,
  Byte: 1,
  Short: 2,
  Int: 3,
  Long: 4,
  Float: 5,
  Double: 6,
  ByteArray: 7,
  String: 8,
  List: 9,
  Compound: 10,
  IntArray: 11,
  LongArray: 12
} as const

/** The numeric id of any NBT tag type. */
export type TagType = (typeof TagType)[keyof typeof TagType]

/** A `TAG_Compound`: an unordered map of names to values. */
export interface NbtCompound {
  [name: string]: NbtValue
}

/**
 * A `TAG_List`. NBT lists are homogeneous, but that is a constraint of the
 * format rather than something the type system can carry, so element access is
 * typed as any value.
 */
export interface NbtList extends Array<NbtValue> {}

/**
 * Any value an NBT tag can hold, after decoding.
 *
 * | Tag | Decodes to |
 * |---|---|
 * | `Byte` `Short` `Int` `Float` `Double` | `number` |
 * | `Long` | `bigint` |
 * | `String` | `string` |
 * | `ByteArray` | `Int8Array` |
 * | `IntArray` | `Int32Array` |
 * | `LongArray` | `BigInt64Array` |
 * | `List` | {@link NbtList} |
 * | `Compound` | {@link NbtCompound} |
 *
 * The four integer types decode to `number` because each fits exactly; only
 * `Long` needs `bigint`. Nothing records which of them a value came from, so a
 * round trip back to NBT needs its own schema.
 */
export type NbtValue =
  | number
  | bigint
  | string
  | Int8Array
  | Int32Array
  | BigInt64Array
  | NbtList
  | NbtCompound

/** Anything holding bytes that {@link readNbt} accepts. */
export type NbtInput = Uint8Array | ArrayBuffer | ArrayBufferView

export interface NbtReadOptions {
  /**
   * Read numbers little-endian. Java Edition is big-endian (the default);
   * Bedrock Edition is little-endian.
   *
   * @defaultValue false
   */
  littleEndian?: boolean

  /**
   * Names to drop while reading. A matching tag is stepped over rather than
   * decoded, at any depth, so a large subtree costs nothing but the walk.
   *
   * Useful for skipping the bulky parts of a file you don't need.
   */
  skip?: ReadonlySet<string>
}

/** An NBT file's root tag, together with its name. */
export interface NbtRoot<T extends NbtCompound = NbtCompound> {
  /** The root tag's name. Empty in most files. */
  name: string
  /** The root compound. */
  value: T
}

const decoder = new TextDecoder()

const GZIP_MAGIC = 0x1f8b
const ZLIB_CMF_DEFLATE = 0x78

function toBytes(input: NbtInput): Uint8Array {
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
}

async function inflate(bytes: Uint8Array, format: CompressionFormat): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * Decompress `bytes` if they carry a gzip or zlib header, otherwise return them
 * unchanged. Called by {@link readNbt}; exported for callers that want to
 * inspect or cache the decompressed form.
 */
export async function decompressNBT(input: NbtInput): Promise<Uint8Array> {
  const bytes = toBytes(input)
  if (bytes.length < 2) return bytes
  if (((bytes[0] << 8) | bytes[1]) === GZIP_MAGIC) return inflate(bytes, "gzip")
  // zlib: low nibble 8 means deflate, and the two header bytes form a multiple of 31
  if (bytes[0] === ZLIB_CMF_DEFLATE && ((bytes[0] << 8) | bytes[1]) % 31 === 0) {
    return inflate(bytes, "deflate")
  }
  return bytes
}

/**
 * Read an NBT file and return its root compound.
 *
 * Decompresses gzip and zlib input automatically. The root tag's name is
 * discarded; use {@link readNbtRoot} to keep it.
 *
 * @typeParam T - Asserted shape of the root compound. Not validated.
 * @param input - Raw file bytes, compressed or not.
 * @throws {Error} If the data isn't NBT, or ends mid-tag.
 *
 * @example
 * ```ts
 * interface Level extends NbtCompound {
 *   Data: NbtCompound
 * }
 *
 * const level = await readNbt<Level>(bytes)
 * const version = level.Data.DataVersion as number
 * ```
 *
 * @example Skipping a subtree you don't need
 * ```ts
 * const chunk = await readNbt(bytes, { skip: new Set(["Heightmaps", "Lights"]) })
 * ```
 */
export async function readNbt<T extends NbtCompound = NbtCompound>(
  input: NbtInput,
  options: NbtReadOptions = {}
): Promise<T> {
  return (await readNbtRoot<T>(input, options)).value
}

/**
 * Read an NBT file and return its root compound along with the root tag's name.
 *
 * Identical to {@link readNbt} except that the name is preserved. It is empty
 * in most files, but some formats rely on it.
 *
 * @typeParam T - Asserted shape of the root compound. Not validated.
 * @param input - Raw file bytes, compressed or not.
 * @throws {Error} If the data isn't NBT, or ends mid-tag.
 */
export async function readNbtRoot<T extends NbtCompound = NbtCompound>(
  input: NbtInput,
  options: NbtReadOptions = {}
): Promise<NbtRoot<T>> {
  const { littleEndian: le = false, skip } = options
  const bytes = await decompressNBT(input)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 0

  function string(): string {
    const length = view.getUint16(offset, le)
    offset += 2
    const value = decoder.decode(bytes.subarray(offset, offset + length))
    offset += length
    return value
  }

  function skipPayload(type: number): void {
    switch (type) {
      case TagType.Byte:
        offset += 1
        return;
      case TagType.Short:
        offset += 2
        return;
      case TagType.Int:
      case TagType.Float:
        offset += 4
        return;
      case TagType.Long:
      case TagType.Double:
        offset += 8
        return;
      case TagType.ByteArray:
        offset += 4 + view.getInt32(offset, le)
        return;
      case TagType.String:
        offset += 2 + view.getUint16(offset, le)
        return;
      case TagType.IntArray:
        offset += 4 + view.getInt32(offset, le) * 4
        return;
      case TagType.LongArray:
        offset += 4 + view.getInt32(offset, le) * 8
        return;
      case TagType.List: {
        const elementType = view.getUint8(offset)
        offset += 1
        const length = view.getInt32(offset, le)
        offset += 4
        for (let i = 0; i < length; i++) skipPayload(elementType)
        return;
      }
      case TagType.Compound: {
        for (;;) {
          const entryType = view.getUint8(offset)
          offset += 1
          if (entryType === TagType.End) return;
          offset += 2 + view.getUint16(offset, le)
          skipPayload(entryType)
        }
      }
      default:
        throw new Error(`Unknown NBT tag type ${type} at byte ${offset - 1}`)
    }
  }

  function payload(type: number): NbtValue {
    switch (type) {
      case TagType.Byte: {
        const value = view.getInt8(offset)
        offset += 1
        return value
      }
      case TagType.Short: {
        const value = view.getInt16(offset, le)
        offset += 2
        return value
      }
      case TagType.Int: {
        const value = view.getInt32(offset, le)
        offset += 4
        return value
      }
      case TagType.Long: {
        const value = view.getBigInt64(offset, le)
        offset += 8
        return value
      }
      case TagType.Float: {
        const value = view.getFloat32(offset, le)
        offset += 4
        return value
      }
      case TagType.Double: {
        const value = view.getFloat64(offset, le)
        offset += 8
        return value
      }
      case TagType.String:
        return string()
      case TagType.ByteArray: {
        const length = view.getInt32(offset, le)
        offset += 4
        const value = new Int8Array(bytes.slice(offset, offset + length).buffer)
        offset += length
        return value
      }
      case TagType.IntArray: {
        const length = view.getInt32(offset, le)
        offset += 4
        const value = new Int32Array(length)
        for (let i = 0; i < length; i++) {
          value[i] = view.getInt32(offset, le)
          offset += 4
        }
        return value
      }
      case TagType.LongArray: {
        const length = view.getInt32(offset, le)
        offset += 4
        const value = new BigInt64Array(length)
        for (let i = 0; i < length; i++) {
          value[i] = view.getBigInt64(offset, le)
          offset += 8
        }
        return value
      }
      case TagType.List: {
        const elementType = view.getUint8(offset)
        offset += 1
        const length = view.getInt32(offset, le)
        offset += 4
        const value: NbtList = new Array(length)
        for (let i = 0; i < length; i++) value[i] = payload(elementType)
        return value
      }
      case TagType.Compound: {
        const value: NbtCompound = {}
        for (;;) {
          const entryType = view.getUint8(offset)
          offset += 1
          if (entryType === TagType.End) return value
          const name = string()
          if (skip?.has(name)) skipPayload(entryType)
          else value[name] = payload(entryType)
        }
      }
      default:
        throw new Error(`Unknown NBT tag type ${type} at byte ${offset - 1}`)
    }
  }

  const rootType = view.getUint8(offset)
  offset += 1
  if (rootType !== TagType.Compound) {
    throw new Error(`NBT root is tag type ${rootType}, expected a compound`)
  }
  const name = string()
  return { name, value: payload(TagType.Compound) as T }
}

export interface FindDataVersionOptions {
  /**
   * Read numbers little-endian (Bedrock Edition).
   * @defaultValue false
   */
  littleEndian?: boolean
}

/**
 * Locates the byte index of the 4-byte `DataVersion` int payload
 * in the top-level compound tag of a decompressed NBT buffer.
 *
 * @returns The byte offset of the int payload, or `-1` if not found.
 */
export function findDataVersionOffset(
  bytes: Uint8Array,
  options: FindDataVersionOptions = {}
): number {
  const le = options.littleEndian ?? false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 0

  function skipPayload(type: number): void {
    switch (type) {
      case TagType.Byte:
        offset += 1
        return;
      case TagType.Short:
        offset += 2
        return;
      case TagType.Int:
      case TagType.Float:
        offset += 4
        return;
      case TagType.Long:
      case TagType.Double:
        offset += 8
        return;
      case TagType.ByteArray:
        offset += 4 + view.getInt32(offset, le)
        return;
      case TagType.String:
        offset += 2 + view.getUint16(offset, le)
        return;
      case TagType.IntArray:
        offset += 4 + view.getInt32(offset, le) * 4
        return;
      case TagType.LongArray:
        offset += 4 + view.getInt32(offset, le) * 8
        return;
      case TagType.List: {
        const elementType = view.getUint8(offset)
        offset += 1
        const length = view.getInt32(offset, le)
        offset += 4
        for (let i = 0; i < length; i++) skipPayload(elementType)
        return;
      }
      case TagType.Compound: {
        for (;;) {
          const entryType = view.getUint8(offset)
          offset += 1
          if (entryType === TagType.End) return;
          offset += 2 + view.getUint16(offset, le)
          skipPayload(entryType)
        }
      }
      default:
        throw new Error(`Unknown NBT tag type ${type} at byte ${offset - 1}`)
    }
  }

  // Verify root tag type
  const rootType = view.getUint8(offset)
  offset += 1
  if (rootType !== TagType.Compound) {
    throw new Error(`NBT root is tag type ${rootType}, expected a compound`)
  }

  // Skip root tag name
  const rootNameLength = view.getUint16(offset, le)
  offset += 2 + rootNameLength

  // Scan top-level compound entries
  for (;;) {
    const entryType = view.getUint8(offset)
    offset += 1
    if (entryType === TagType.End) return -1

    const nameLength = view.getUint16(offset, le)
    offset += 2

    // "DataVersion" is 11 bytes long
    let isDataVersion = false
    if (nameLength === 11) {
      const nameBytes = bytes.subarray(offset, offset + 11)
      isDataVersion = decoder.decode(nameBytes) === "DataVersion"
    }

    offset += nameLength

    if (isDataVersion) {
      if (entryType !== TagType.Int) {
        throw new Error(`Expected DataVersion to be TAG_Int (3), got ${entryType}`)
      }
      return offset
    }

    skipPayload(entryType)
  }
}
