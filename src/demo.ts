import * as fs from 'node:fs';
import { ThriftFile } from './parser.js';
import { renderRo } from './render.js';

const tf = new ThriftFile();
const raw = fs.readFileSync(process.argv[2] || 'test.thrift', 'utf-8');
tf.parse(raw);

const out = renderRo(tf);

console.info(out);
