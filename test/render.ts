/**
 * @fileoverview Checks a number of files purely that they render at all.
 */

import test from 'node:test';
import * as fs from 'node:fs';
import * as url from 'node:url';
import * as path from 'node:path';
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
