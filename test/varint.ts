import test from 'node:test';
import assert from 'node:assert';
import { readZigZagVarint53 } from '../src/deps/varint.js';

const makeReader = (buf: Uint8Array) => {
  let index = 0;
  return () => {
    return buf[index++] ?? 0;
  };
};

const check = (expected: number, ...bytes: number[]) => {
  const x = new Uint8Array(bytes);
  const out = readZigZagVarint53(makeReader(x));

  assert.strictEqual(expected, out);
};

test('varint', () => {
  check(96 >> 1, 96);
  check(96 >> 1, 96, 96, 96); // ignored, no continuation
  check(2151801165, 154, 133, 143, 132, 16, 28, 21, 10, 25, 53, 4, 0, 6, 25, 24, 1);
});
