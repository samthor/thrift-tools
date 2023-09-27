import type { CompactProtocolReader } from './reader.js';

export enum CompactProtocolType {
  CT_STOP = 0,

  /**
   * This is a `true` encoded in a struct field.
   */
  CT_BOOLEAN_TRUE = 1,

  /**
   * This may be `false` encoded in a struct field, or the bool type argument of a list/set/map.
   */
  CT_BOOLEAN_FALSE_OR_TYPE = 2,

  CT_BYTE = 3,
  CT_I16 = 4,
  CT_I32 = 5,
  CT_I64 = 6,
  CT_DOUBLE = 7,
  CT_BINARY = 8,
  CT_LIST = 9,
  CT_SET = 10,
  CT_MAP = 11,
  CT_STRUCT = 12,

  /**
   * UUIDs are encoded as exactly 16 bytes with no length header.
   */
  CT_UUID = 13,
}

/**
 * Provides the minimum specifications to read Thrift encoded data. This is required by the
 * `.read()` method on codegen classes created by `thrift-tools` to read from some source.
 *
 * You should just use the concrete implementation {@link CompactProtocolReader} unless you're
 * doing something really weird.
 *
 * This is a simple definition that isn't async, and can't really be used to 'fetch more' during
 * parsing (e.g., while data is arriving from a network).
 */
export interface ThriftReader {
  readStructBegin(): void;
  readStructKey(): number;
  readListHeader(): { type: CompactProtocolType; length: number };
  readMapHeader(): { mkey: number; length: number };

  readBool(): boolean;
  readByte(): number;
  readI16(): number;
  readI32(): number;
  readI64(): number;
  readDouble(): number;
  readBinary(): Uint8Array;
  readUUID(): Uint8Array;
  readString(): string;

  skip(type: CompactProtocolType): void;
  skipMany(count: number, type: CompactProtocolType, extraType?: number): void;
}

/**
 * Required to write Thrift encoded data.
 */
export interface ThriftWriter {
  writeStructBegin(): void;
  writeStructKey(type: CompactProtocolType, fieldId: number): void;

  writeListHeader(type: CompactProtocolType, length: number): void;
  writeMapHeader(mkey: number, length: number): void;

  writeBool(v: boolean): void;
  writeByte(v: number): void;
  writeI16(v: number): void;
  writeI32(v: number): void;
  writeI64(v: number): void;
  writeDouble(v: number): void;
  writeBinary(v: Uint8Array): void;
  writeUUID(v: Uint8Array): void;
  writeString(v: string): void;
}

/**
 * Helper to read a {@link Map}. Used by codegen created by `thrift-tools`.
 */
export function readMap<K, V>(
  input: ThriftReader,
  mkey: number,
  kreader: () => K,
  vreader: () => V,
): Map<K, V> {
  const m = new Map<K, V>();

  const info = input.readMapHeader();
  if (info.mkey !== mkey) {
    input.skipMany(info.length, info.mkey >>> 4, info.mkey & 0xf);
    return m;
  }

  for (let i = 0; i < info.length; ++i) {
    m.set(kreader(), vreader());
  }
  return m;
}

/**
 * Helper to read a {@link Array} (or a {@link Set}, as they are encoded the same way). Used by
 * codegen created by `thrift-tools`.
 */
export function readList<T>(
  input: ThriftReader,
  type: CompactProtocolType,
  reader: () => T,
): Array<T> {
  const { type: ltype, length } = input.readListHeader();

  if (length === 0) {
    return [];
  } else if (ltype !== type) {
    input.skipMany(length, ltype);
    return [];
  }

  // prealloc array gives small speedup
  const out = new Array<T>(length);
  for (let i = 0; i < length; ++i) {
    out[i] = reader();
  }
  return out;
}

/**
 * Helper to write a {@link Map}.
 */
export function writeMap<K, V>(
  output: ThriftWriter,
  mkey: number,
  data: Map<K, V>,
  kwriter: (k: K) => void,
  vwriter: (v: V) => void,
) {
  output.writeMapHeader(mkey, data.size);
  for (const [k, v] of data.entries()) {
    kwriter(k);
    vwriter(v);
  }
}
