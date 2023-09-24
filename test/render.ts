/**
 * @fileoverview Checks a number of files purely that they render at all.
 */

import test from 'node:test';
import * as fs from 'node:fs';
import * as url from 'node:url';
import * as path from 'node:path';
import assert from 'node:assert';
import { renderThrift } from '../src/render.js';
import { ThriftFile } from '../src/parser.js';

const testdataPath = url.fileURLToPath(new URL('./data/', import.meta.url));

test('samples can be rendered', (t) => {
  const allFiles = fs.readdirSync(testdataPath).filter((x) => x.endsWith('.thrift'));

  for (const f of allFiles) {
    const raw = fs.readFileSync(path.join(testdataPath, f), 'utf-8');
    console.debug(f, raw.length);

    let tf: ThriftFile;
    try {
      tf = new ThriftFile();
      tf.parse(raw);
    } catch (e) {
      console.warn('Could not parse file');
      throw e;
    }

    try {
      renderThrift(tf);
    } catch (e) {
      console.warn('Could not render file');
      throw e;
    }
  }
});

test('default behavior', async (t) => {
  const tf = new ThriftFile();
  tf.parse(`struct X { 1: string foo = "hello"; 12345: list<i8> xxx; 4: bool y = 1 }`);

  assert.deepStrictEqual(tf.types['X'], {
    type: 'struct',
    records: {
      foo: {
        fieldId: 1,
        type: 'string',
        defaultValue: `"hello"`,
      },
      xxx: {
        fieldId: 12345,
        type: { outer: 'list', inner: ['i8'] },
      },
      y: {
        fieldId: 4,
        type: 'bool',
        defaultValue: 1, // not cooerced yet
      },
    },
  });

  const out = renderThrift(tf);
  assert(out.includes('y: boolean = true'));
});
