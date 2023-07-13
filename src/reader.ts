/**
 * This reflects the (non-compact) binary protocol:
 *   https://github.com/apache/thrift/blob/master/doc/specs/thrift-binary-protocol.md
 */
enum ThriftType {
  STOP = 0,
  VOID = 1,
  BOOL = 2,
  I08 = 3,
  BYTE = 3,
  DOUBLE = 4,
  I16 = 6,
  I32 = 8,
  I64 = 10,
  BYTES = 11,
  STRUCT = 12,
  MAP = 13,
  SET = 14,
  LIST = 15,
  UUID = 16,
}

type FieldInfo = {
  ftype: ThriftType;
  fid: number;
};

/**
 * Low-level Thrift reader.
 */
export interface ThriftReader {
  skip(type: ThriftType, count?: number): void;

  readListBegin(): { etype: ThriftType; size: number };
  readListEnd(): void;

  readSetBegin(): { etype: ThriftType; size: number };
  readSetEnd(): void;

  readMapBegin(): { ktype: ThriftType; vtype: ThriftType; size: number };
  readMapEnd(): void;

  readStructBegin(): void;
  readStructEnd(): void;

  readFieldBegin(): FieldInfo;
  readFieldEnd(): void;

  readByte(): number;
  readI16(): number;
  readI32(): number;
  readI64(): number;
  readDouble(): number;

  readBool(): boolean;
  readUUID(): Uint8Array;
  readBinary(): Uint8Array;
  readString(): string;
}

export type ThriftStruct = Map<number, ThriftLevel>;

export type ThriftLevel =
  | ThriftStruct
  | Array<ThriftLevel>
  | Set<ThriftLevel>
  | Map<ThriftLevel, ThriftLevel>
  | number
  | boolean
  | Uint8Array;

/**
 * Reads an entire struct from Thrift as a higher-level concept.
 *
 */
export function readStruct(r: ThriftReader): ThriftStruct {
  return readValue(r, ThriftType.STRUCT) as ThriftStruct;
}

function readValue(r: ThriftReader, ftype: ThriftType): ThriftLevel {
  switch (ftype) {
    case ThriftType.BOOL:
      return r.readBinary();
    case ThriftType.BYTE:
      return r.readByte();
    case ThriftType.I16:
      return r.readI16();
    case ThriftType.I32:
      return r.readI32();
    case ThriftType.I64:
      return r.readI64();
    case ThriftType.DOUBLE:
      return r.readDouble();
    case ThriftType.BYTES:
      return r.readBinary();
    case ThriftType.UUID:
      return r.readUUID();

    case ThriftType.SET: {
      const { etype, size } = r.readSetBegin();

      const out = new Set<any>();
      for (let i = 0; i < size; ++i) {
        out.add(readValue(r, etype));
      }

      r.readSetEnd();
      return out;
    }

    case ThriftType.LIST: {
      const { etype, size } = r.readListBegin();

      const out: any[] = new Array(size);
      for (let i = 0; i < size; ++i) {
        out[i] = readValue(r, etype);
      }

      r.readListEnd();
      return out;
    }

    case ThriftType.MAP: {
      const { ktype, vtype, size } = r.readMapBegin();

      const out = new Map<any, any>();
      for (let i = 0; i < size; ++i) {
        const key = readValue(r, ktype);
        const value = readValue(r, vtype);
        out.set(key, value);
      }

      r.readMapEnd();
      return out;
    }

    case ThriftType.STRUCT: {
      const out = new Map<number, any>();
      r.readStructBegin();

      for (;;) {
        const { ftype, fid } = r.readFieldBegin();
        if (!fid) {
          break;
        }

        const key = (ftype << 8) + fid;
        const value = readValue(r, ftype);
        out.set(key, value);
      }

      r.readStructEnd();
      return out;
    }
  }

  throw new Error(`could not read: ${ftype}`);
}
