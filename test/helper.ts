import * as esbuild from 'esbuild';
import * as url from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { renderRo } from '../src/render.js';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const compilerDepsSource = fs.readFileSync(
  path.join(__dirname, '../src/deps/compiler-deps.ts'),
  'utf-8',
);
const compilerDepsImport = await convertToImportUrl(compilerDepsSource);

export async function convertToImportUrl(s: string) {
  const transformOut = await esbuild.transform(s, {
    format: 'esm',
    loader: 'ts',
  });
  return `data:text/javascript;charset=utf-8;base64,${btoa(transformOut.code)}`;
}

export async function prepareRenderRo(s: string) {
  const ts = renderRo(s, {
    toolImport: compilerDepsImport,
  });
  const js = await convertToImportUrl(ts);
  return import(js);
}
