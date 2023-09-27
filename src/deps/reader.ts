import type { CompactProtocolType, ThriftReader } from './compiler-deps.js';
import { readVarint32, readZigZagVarint32, readZigZagVarint53 } from './varint.js';

const dec = new TextDecoder();

/**
 * An abstract class that can read the Thrift Compact Protocol. Bytes-related methods must be
 * implemented for this to work.
 */
export abstract class AbstractCompactProtocolReader implements ThriftReader {
  private fieldIdStack: number[] = [];
  private fieldId: number = 0;
  private pendingBool?: boolean;

  private readVarint32: () => number;
  private readZigZagVarint32: () => number;
  private readZigZagVarint53: () => number;

  abstract readByte(): number;
  abstract readBytes(size: number): Uint8Array;
  abstract skipBytes(size: number): void;

  constructor() {
    const readByteBind = this.readByte.bind(this);
    this.readVarint32 = readVarint32.bind(null, readByteBind);
    this.readZigZagVarint32 = readZigZagVarint32.bind(null, readByteBind);
    this.readZigZagVarint53 = readZigZagVarint53.bind(null, readByteBind);
  }

  readStructBegin(): void {
    this.fieldIdStack.push(this.fieldId);
    this.fieldId = 0;
  }

  readStructKey(): number {
    const b = this.readByte();
    if (b === 0) {
      this.fieldId = this.fieldIdStack.pop()! || 0;
      return 0;
    }
    const protocolType: CompactProtocolType = b & 0xf;
    const modifier = b >>> 4;
    if (modifier === 0) {
      // This is a new field ID.
      this.fieldId = this.readI16();
    } else {
      // This is a delta encoded in the type byte.
      this.fieldId += modifier;
    }

    // TODO: could remove this 'bool' logic - make struct parser do it
    // becomes inconsistent with binary protocol?

    if (protocolType === 1) {
      this.pendingBool = true;
      return (this.fieldId << 8) + 2; // pretend this is `false` for a read

    } else if (protocolType === 2) {
      this.pendingBool = false;
    }

    return (this.fieldId << 8) + protocolType;
  }

  /**
   * Reads a struct key type only for skip. Does not interact with the stack.
   */
  private readStructKeyTypeSkip(): number {
    const b = this.readByte();
    if (b === 0) {
      return 0;
    }
    const protocolType: CompactProtocolType = b & 0xf;
    const modifier = b >>> 4;
    if (modifier === 0) {
      this.skipVarint();
    }

    if (protocolType === 1) {
      this.pendingBool = true;
    } else if (protocolType === 2) {
      this.pendingBool = false;
    }
    return protocolType;
  }

  readListHeader(): { type: number; length: number } {
    const head = this.readByte();
    let length = head >>> 4;
    if (length === 15) {
      length = Math.max(0, this.readVarint32()); // too long
    }
    return { type: head & 0xf, length };
  }

  readMapHeader(): { mkey: number; length: number } {
    const length = this.readVarint32();
    if (length <= 0) {
      return { mkey: 0, length: 0 };
    }
    const mkey = this.readByte();
    return { mkey, length };
  }

  readBool(): boolean {
    if (this.pendingBool !== undefined) {
      const out = this.pendingBool;
      this.pendingBool = undefined;
      return out;
    }
    return this.readByte() === 1;
  }

  readI16(): number {
    return this.readZigZagVarint32(); // lol
  }

  readI32(): number {
    return this.readZigZagVarint32();
  }

  readI64(): number {
    return this.readZigZagVarint53();
  }

  /**
   * Reads a double. This is always 8 bytes. Little-endian.
   */
  readDouble() {
    const bytes = this.readBytes(8);
    const dv = new DataView(bytes.buffer, bytes.byteOffset);
    return dv.getFloat64(0, true);
  }

  readBinary(): Uint8Array {
    const size = this.readVarint32();
    return this.readBytes(size);
  }

  readUUID() {
    return this.readBytes(16);
  }

  readString(): string {
    const b = this.readBinary();
    return dec.decode(b);
  }

  private skipVarint() {
    let b: number;
    do {
      b = this.readByte();
    } while (b & 0x80);
  }

  skip(type: number) {
    switch (type) {
      case 0:
        break;
      case 1: // CT_BOOLEAN_TRUE
      // Should never happen
      // fall-through
      case 2: // CT_BOOLEAN_FALSE_OR_TYPE
        if (this.pendingBool !== undefined) {
          this.pendingBool = undefined;
          break;
        }
      // fall-through
      case 3: // CT_BYTE
        this.readByte();
        break;
      case 4: // CT_I16
      case 5: // CT_I32
      case 6: // CT_I64
        this.skipVarint();
        break;
      case 7: // CT_DOUBLE
        this.skipBytes(8);
        break;
      case 8: {
        // CT_BINARY
        const size = this.readVarint32();
        this.skipBytes(size);
        break;
      }
      case 9: // CT_LIST
      case 10: {
        // CT_SET
        const info = this.readListHeader();
        this.skipMany(info.length, info.type);
        break;
      }
      case 11: {
        // CT_MAP
        const info = this.readMapHeader();
        this.skipMany(info.length, info.mkey >>> 4, info.mkey & 0xf);
        break;
      }
      case 12: {
        // CT_STRUCT
        for (;;) {
          const type = this.readStructKeyTypeSkip();
          if (type === 0) {
            break;
          }
          this.skip(type);
        }
        break;
      }
      case 13: // CT_UUID
        this.skipBytes(16);
        break;
      default:
        throw new Error(`bad CT=${type}`);
    }
  }

  skipMany(count: number, type: number, extraType: number = 0): void {
    for (let i = 0; i < count; ++i) {
      this.skip(type);
      this.skip(extraType);
    }
  }
}

/**
 * Reads a Thrift-compact encoded stream from a concrete buffer that is provided at construction
 * time.
 */
export class CompactProtocolReader extends AbstractCompactProtocolReader {
  private buf: Uint8Array;
  at: number;

  constructor(buf: Uint8Array, at = 0) {
    super();
    this.buf = buf;
    this.at = at;
  }

  readByte(): number {
    return this.buf[this.at++] ?? 0;
  }

  readBytes(size: number): Uint8Array {
    const end = this.at + size;
    const out = this.buf.subarray(this.at, end);
    this.at = end;
    return out;
  }

  skipBytes(size: number): void {
    this.at += size;
  }

  readDouble(): number {
    const dv = new DataView(this.buf.buffer, this.buf.byteOffset + this.at, 8);
    const out = dv.getFloat64(0, true);
    this.at += 8;
    return out;
  }
}

export class CompactProtocolReaderPoll_OutOfData extends Error {}

/**
 * Reads a Thrift-compact encoded stream from a source which may be polled for additional bytes.
 *
 * If there are no more bytes available, throws {@link CompactProtocolReaderPoll_OutOfData}. This
 * could be used to reinitialize this class with more data. The reader code isn't async, so it's
 * currently not possible to "get more" data from a source inline: this approach can be useful for
 * reading/polling small parts of data of unknown size.
 */
export class CompactProtocolReaderPoll extends AbstractCompactProtocolReader {
  private more: (min: number) => Uint8Array;
  private pending: Uint8Array = new Uint8Array();
  private at = 0;
  private _consumed = 0;

  get consumed() {
    return this._consumed;
  }

  /**
   * @param more To provide more bytes. Must always return >= min request.
   */
  constructor(arg: Uint8Array | ((min: number) => Uint8Array)) {
    super();

    if (arg instanceof Uint8Array) {
      this.pending = arg;
      this.more = () => {
        throw new CompactProtocolReaderPoll_OutOfData();
      };
    } else {
      this.more = arg;
    }
  }

  private ensure(min: number) {
    if (this.at + min <= this.pending.length) {
      return; // ok!
    }

    const suffix = this.pending.subarray(this.at);
    min -= suffix.length;

    const update = this.more(min);
    if (update.length < min) {
      throw new CompactProtocolReaderPoll_OutOfData();
    }

    if (suffix.length) {
      // Need to combine the remaining suffix with new data. Just create a new buffer, oh well.
      this.pending = new Uint8Array(suffix.length + update.length);
      this.pending.set(suffix);
      this.pending.set(update, suffix.length);
    } else {
      // Can use verbatim, no prior data to keep.
      this.pending = update;
    }
    this.at = 0;
  }

  readByte(): number {
    this.ensure(1);
    const out = this.pending[this.at] ?? 0;
    ++this.at;
    ++this._consumed;
    return out;
  }

  readBytes(size: number): Uint8Array {
    if (size === 0) {
      return new Uint8Array();
    } else if (size < 0) {
      throw new TypeError(`Got -ve binary size: ${size}`);
    }
    this.ensure(size);
    this._consumed += size;

    const end = this.at + size;
    const out = this.pending.subarray(this.at, end);
    this.at = end;
    return out;
  }

  skipBytes(size: number): void {
    if (size < 0) {
      throw new TypeError(`cannot skip -ve bytes: ${size}`);
    }
    this.ensure(size);
    this._consumed += size;
    this.at += size;
  }
}
