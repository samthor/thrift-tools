import test from 'node:test';
import { prepareRenderThrift } from './helper.js';

test('import a simple thrift with writes', async (t) => {
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
  const mod = await prepareRenderThrift(source, true);
});
