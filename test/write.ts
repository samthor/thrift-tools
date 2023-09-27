import test from 'node:test';
import * as assert from 'node:assert';
import { prepareRenderThrift } from './helper.js';
import { CompactProtocolWriter } from '../src/deps/writer.js';
import { CompactProtocolReader } from '../src/deps/reader.js';

test('import a simple thrift with writes', async (t) => {
  const source = `
  struct forTest {
    1: uuid foo;
    2: Other other;
    30: required list<bool> bar;
    40: i32 zing = 1123;
  }
  struct Other {
    55: bool a = 1;
    56: bool b;
    57: bool c;
    100: i64 z;
    999: map<string, i8> some_map;
  }
  `;
  const mod = await prepareRenderThrift(source, true);

  const x = new mod.forTest();
  x.other = new mod.Other();
  x.other.z = 4;
  x.other.some_map = new Map();
  x.other.some_map.set('hello', 1);

  const w = new CompactProtocolWriter();
  x.write(w);

  const out = w.render();
  const r = new CompactProtocolReader(out);

  const x2 = new mod.forTest();
  x2.read(r);

  assert.deepStrictEqual(x, x2);
  assert.notStrictEqual(x, x2);
  assert.strictEqual(x.other.some_map.get('hello'), 1);
});
