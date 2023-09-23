// TODO: currently disused
// export enum ThriftType {
//   STOP = 0,
//   VOID = 1,
//   BOOL = 2,
//   I08 = 3,
//   BYTE = 3,
//   DOUBLE = 4,
//   I16 = 6,
//   I32 = 8,
//   I64 = 10,
//   BYTES = 11,
//   STRUCT = 12,
//   MAP = 13,
//   SET = 14,
//   LIST = 15,
//   UUID = 16,
// }

export enum CompactProtocolType {
  CT_STOP = 0,
  CT_BOOLEAN_TRUE = 1, // true in struct
  CT_BOOLEAN_FALSE_OR_TYPE = 2, // encoded false in struct, but generic bool type in list/set/map
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
  CT_UUID = 13, // always 16 bytes long
}

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

export function readList<T>(input: ThriftReader, type: CompactProtocolType, reader: () => T): Array<T> {
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
