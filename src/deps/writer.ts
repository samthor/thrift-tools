import { CompactProtocolType, ThriftWriter } from './compiler-deps.js';
import { writeVarint } from './varint.js';

const enc = new TextEncoder();

export abstract class AbstractCompactProtocolWriter implements ThriftWriter {
  private fieldIdStack: number[] = [];
  private fieldId: number = 0;

  private pendingBoolFieldId?: number;

  abstract writeBytes(v: Uint8Array): void;

  private writeVarint32(v: number): void {
    // TODO: This is probably not very fast.
    const varintBuffer = new Uint8Array(8);
    const length = writeVarint(v, varintBuffer);
    this.writeBytes(varintBuffer.slice(0, length));
  }

  writeStructBegin(): void {
    this.fieldIdStack.push(this.fieldId);
    this.fieldId = 0;
  }

  writeStructKey(type: CompactProtocolType, fieldId: number): void {
    if (type === 0) {
      this.writeByte(0);
      this.fieldId = this.fieldIdStack.pop()! || 0;
      return;
    }

    if (type === 1 || type === 2) {
      // Assume we don't actually have the bool yet, wait for a call to `writeBool`.
      this.pendingBoolFieldId = fieldId;
    } else {
      this.internalWriteStructKey(type, fieldId);
    }
  }

  private internalWriteStructKey(type: CompactProtocolType, fieldId: number) {
    const delta = fieldId - this.fieldId;
    if (delta > 0 && delta <= 15) {
      this.writeByte((delta << 4) + type);
    } else {
      this.writeByte(type);
      this.writeI16(fieldId);
    }
    this.fieldId = fieldId;
  }

  writeListHeader(type: CompactProtocolType, length: number): void {
    length = Math.max(0, length);
    if (length < 15) {
      this.writeByte((length << 4) + type);
    } else {
      this.writeByte((15 << 4) + type);
      this.writeVarint32(length);
    }
  }

  writeMapHeader(mkey: number, length: number): void {
    if (length <= 0) {
      this.writeByte(0); // technically a varint of zero
      return;
    }
    this.writeVarint32(length);
    this.writeByte(mkey);
  }

  writeBool(v: boolean): void {
    if (this.pendingBoolFieldId === undefined) {
      this.writeByte(v ? 1 : 0);
    } else {
      this.internalWriteStructKey(v ? 1 : 2, this.pendingBoolFieldId);
      this.pendingBoolFieldId = undefined;
    }
  }

  writeByte(v: number) {
    const b = new Uint8Array([v]);
    this.writeBytes(b);
  }

  writeI16(v: number): void {
    this.writeI32(v);
  }

  writeI32(v: number): void {
    this.writeVarint32(((v << 1) ^ (v >> 31)) >>> 0);
  }

  writeI64(v: number): void {
    if (v > 2147483647) {
      // TODO: can't bitshift >32bit
      throw new Error('TODO: zigzag varint write 64bit');
    }
    this.writeI32(v);
  }

  writeDouble(v: number): void {
    const b = new Uint8Array(8);
    const dv = new DataView(b.buffer);
    dv.setFloat64(0, v, true);
    this.writeBytes(b);
  }

  writeBinary(v: Uint8Array): void {
    this.writeVarint32(v.length);
    this.writeBytes(v);
  }

  writeUUID(v: Uint8Array): void {
    const uuid = v.slice(0, 16);
    this.writeBytes(uuid);

    if (uuid.length < 16) {
      const rest = new Uint8Array(16 - uuid.length);
      this.writeBytes(rest);
    }
  }

  writeString(v: string): void {
    this.writeBinary(enc.encode(v));
  }
}

/**
 * A concrete implementation of {@link ThriftWriter} which is probably not very fast.
 */
export class CompactProtocolWriter extends AbstractCompactProtocolWriter {
  private out: Uint8Array;
  private _at: number;

  constructor(buffer = new Uint8Array(), at = 0) {
    super();
    this.out = buffer;
    this._at = at;
  }

  private maybeExpand(req = 1) {
    if (this._at + req <= this.out.length) {
      return;
    }
    const prev = this.out;
    this.out = new Uint8Array((prev.length + 1) * 2);
    this.out.set(prev, 0);
  }

  writeBytes(v: Uint8Array): void {
    if (!v.length) {
      return;
    }
    this.maybeExpand(v.length);
    this.out.set(v, this._at);
    this._at += v.length;
  }

  writeByte(v: number): void {
    this.maybeExpand();
    this.out[this._at++] = v;
  }

  get at() {
    return this._at;
  }

  render(): Uint8Array {
    return this.out.subarray(0, this._at);
  }
}
