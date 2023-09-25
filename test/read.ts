import test from 'node:test';
import { prepareRenderThrift } from './helper.js';
import assert from 'node:assert';
import { CompactProtocolType } from '../src/deps/compiler-deps.js';
import { CompactProtocolReader } from '../src/deps/reader.js';
import { renderThrift } from '../src/render.js';

test('read and import a simple thrift', async (t) => {
  const source = `
  struct forTest {
    1: uuid foo;
    2: Other y;
    30: required list<bool> bar;
    40: i32 zing = 123;
  }
  struct Other {
    55: bool a = 1;
    56: bool b;
    57: bool c;
  }
  `;
  const mod = await prepareRenderThrift(source);

  const codegen = renderThrift(source);

  const x = new mod.forTest();
  assert.deepStrictEqual(x.foo, undefined, 'optional fields start undefined');
  assert.deepStrictEqual(x.bar, []);
  assert.deepStrictEqual(x.zing, 123);

  const rawBytes = new Uint8Array(
    [
      // field header
      (1 << 4) + CompactProtocolType.CT_UUID,
      // uuid (16 bytes)
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      // field header for list
      CompactProtocolType.CT_LIST,
      30 << 1, // fieldId reset (zigzag encoding, shift left)
      // list header
      (3 << 4) + CompactProtocolType.CT_BOOLEAN_FALSE_OR_TYPE,
      1,
      0,
      1,
      // some ignored struct field
      (12 << 4) + CompactProtocolType.CT_I16,
      0x80,
      0,
      // nested Other
      CompactProtocolType.CT_STRUCT,
      2 << 1, // fieldId reset (zigzag encoding, shift left)
      [
        // bool value a
        CompactProtocolType.CT_BOOLEAN_FALSE_OR_TYPE,
        55 << 1, // fieldId reset (zigzag encoding, shift left)
        // bool value b
        (1 << 4) + CompactProtocolType.CT_BOOLEAN_TRUE,
        // end of struct
        0,
      ],
      // end of struct
      0,
    ].flat(),
  );

  const reader = new CompactProtocolReader(rawBytes);
  x.read(reader);

  assert.deepStrictEqual(x.bar, [true, false, true]);
  assert.deepStrictEqual([...x.foo], [1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.strictEqual(x.y.a, false);
  assert.strictEqual(x.y.b, true);
  assert.strictEqual(x.y.c, undefined);
});
