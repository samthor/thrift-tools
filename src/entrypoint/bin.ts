#!/usr/bin/env node

import { parseArgs } from 'node:util';
import * as fs from 'node:fs';
import { renderThrift } from '../render.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    toolImport: {
      type: 'string',
    },
    help: {
      type: 'boolean',
      short: 'h',
    },
  },
});

if (values.help || positionals.length !== 2 || positionals[0] !== 'codegen') {
  process.stderr.write('usage: thrift-tools codegen [path]\n');
  process.stderr.write('  --toolImport="thrift-tools": where to include needed helpers from\n');
  process.exit(values.help ? 0 : 1);
}

const raw = fs.readFileSync(positionals[1], 'utf-8');
const out = renderThrift(raw, values);
process.stdout.write(out);
