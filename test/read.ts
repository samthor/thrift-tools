import test from 'node:test';
import { prepareRenderThrift } from './helper.js';
import assert from 'node:assert';
import { CompactProtocolType } from '../src/deps/compiler-deps.js';
import { CompactProtocolReader } from '../src/deps/reader.js';

test('read and import a simple thrift', async (t) => {
  const mod = await prepareRenderThrift(`
  struct forTest {
    1: uuid foo;
    2: required list<bool> bar;
    4: i32 zing = 123;
  }
  `);

  const x = new mod.forTest();
  assert.deepStrictEqual(x.foo, undefined, 'optional fields start undefined');
  assert.deepStrictEqual(x.bar, []);
  assert.deepStrictEqual(x.zing, 123);

  const rawBytes = new Uint8Array([
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
    (1 << 4) + CompactProtocolType.CT_LIST,
    // list header
    (3 << 4) + CompactProtocolType.CT_BOOLEAN_FALSE_OR_TYPE,
    1,
    0,
    1,
    // some ignored struct field
    (12 << 4) + CompactProtocolType.CT_I16,
    0x80,
    0,
    // end of struct
    0,
  ]);

  const reader = new CompactProtocolReader(rawBytes);
  x.read(reader);

  assert.deepStrictEqual(x.bar, [true, false, true]);
  assert.deepStrictEqual([...x.foo], [1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8]);
});
