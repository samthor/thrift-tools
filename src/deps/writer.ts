import { CompactProtocolType, ThriftWriter } from './compiler-deps.js';

const enc = new TextEncoder();

export abstract class AbstractCompactProtocolWriter implements ThriftWriter {
  private fieldIdStack: number[] = [];
  private fieldId: number = 0;

  private pendingBoolFieldId?: number;

  abstract writeBytes(v: Uint8Array): void;
  abstract writeByte(v: number): void;

  private writeVarint32(v: number): void {
    throw new Error('TODO: writeVarint32');
  }

  writeStructBegin(): void {
    this.fieldIdStack.push(this.fieldId);
    this.fieldId = 0;
  }

  writeStructKey(type: CompactProtocolType, fieldId: number): void {
    if (type === 0) {
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

  writeI16(v: number): void {
    throw new Error('TODO: zigzag varint write');
  }

  writeI32(v: number): void {
    throw new Error('TODO: zigzag varint write');
  }

  writeI64(v: number): void {
    throw new Error('TODO: zigzag varint write');
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
