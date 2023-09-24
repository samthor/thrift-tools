import * as moo from 'moo';

// @ts-ignore
const mood = moo.default;

const lexer = mood.compile({
  ws: /[ \t]+/,
  newline: { match: '\n', lineBreaks: true },
  comma: ',',
  semi: ';',
  colon: ':',
  commentLine: /\/\/[^\n]*/,
  comment: /\/\*[^]*?\*\//,
  int: {
    // @ts-ignore Bad types
    match: /\d+/,
    value: (x) => +x,
  },
  token: /\w[\w\d]*(?:\.\w[\w\d]*)*/,
  lbrace: '{',
  rbrace: '}',
  larrow: '<',
  rarrow: '>',
  equal: '=',
  // from moo's homepage: https://github.com/no-context/moo
  // this probably will fail at escaped things.
  string: { match: /"(?:\\["\\]|[^\n"\\])*"/, value: (s) => s.slice(1, -1) },
});

export type TemplateType = {
  outer: string;
  inner: (string | TemplateType)[];
};

export type ObjectRecord = {
  fieldId: number;
  type: string | TemplateType;
  required?: boolean;
  defaultValue?: number | string;
};

export type EnumType = {
  type: 'enum';
  options: Record<string, number>;
};

export type ObjectType = {
  type: 'struct' | 'union';
  records: Record<string, ObjectRecord>;
};

export class ThriftFile {
  namespaces: Record<string, string> = {};
  types: Record<string, EnumType | ObjectType> = {};

  #lastComment: string = '';
  #peeked: moo.Token | undefined;

  #next(): moo.Token {
    if (this.#peeked) {
      const out = this.#peeked;
      this.#peeked = undefined;
      return out;
    }

    for (;;) {
      const t = lexer.next();
      if (t?.type === undefined) {
        return {
          type: 'eof',
          offset: 0,
          value: '',
          text: '',
          lineBreaks: 0,
          line: 0,
          col: 0,
        };
      }
      if (['ws', 'comment', 'commentLine'].includes(t.type)) {
        if (t.type === 'comment') {
          this.#lastComment = t.value;
        }
        continue;
      }
      return t;
    }
  }

  #peek() {
    if (!this.#peeked) {
      this.#peeked = this.#next();
    }
    return this.#peeked;
  }

  #expect(type: string | string[], newlines = false): moo.Token {
    type = [type].flat();
    for (;;) {
      const t = this.#next();
      if (!t?.type) {
        throw new Error(`no type available, expected: ${type} t=${t}`);
      }

      if (newlines && ['ws', 'newline', 'semi'].includes(t.type)) {
        continue;
      }
      if (!type.includes(t.type)) {
        throw new Error(`expected type=${type}, was type=${t?.type}`);
      }
      return t;
    }
  }

  parse(text: string) {
    lexer.reset(text);
    const expect = this.#expect.bind(this);

    while (true) {
      const initToken = expect(['token', 'eof'], true);
      if (initToken.type === 'eof') {
        break;
      }
      const nameToken = expect('token');

      switch (initToken.text) {
        case 'namespace': {
          const valueToken = expect('token');
          this.namespaces[nameToken.value] = valueToken.value;
          break;
        }
        case 'enum': {
          const e: EnumType = { type: 'enum', options: {} };
          this.types[nameToken.value] = e;

          expect('lbrace');
          for (;;) {
            const next = expect(['rbrace', 'token'], true);
            if (next.type === 'rbrace') {
              break;
            }

            expect('equal');
            const intToken = expect('int');
            e.options[next.value] = +intToken.value;
          }
          break;
        }
        case 'struct':
        case 'union': {
          const o: ObjectType = { type: initToken.text, records: {} };
          this.types[nameToken.value] = o;

          expect('lbrace');
          for (;;) {
            const next = expect(['rbrace', 'int'], true);
            if (next.type === 'rbrace') {
              break;
            }
            expect('colon');

            const r: ObjectRecord = { fieldId: +next.value, type: '' };

            const qualifierToken = this.#peek();
            if (qualifierToken.type === 'token') {
              if (qualifierToken.value === 'required') {
                r.required = true;
                expect('token');
              } else if (qualifierToken.value === 'optional') {
                // ignore
                expect('token');
              }
            }

            r.type = this.#consumeType();
            const fieldNameToken = expect('token');

            const equalsToken = this.#peek();
            if (equalsToken.type === 'equal') {
              expect('equal');
              const valueToken = expect(['int', 'string']);
              r.defaultValue = valueToken.value;
            }

            o.records[fieldNameToken.value] = r;
          }

          break;
        }
        default:
          throw new Error(`unknown token: ${initToken.text}`);
      }
    }
  }

  #consumeType(): string | TemplateType {
    const expect = this.#expect.bind(this);
    const typeToken = expect('token');

    const outer = typeToken.value;

    const maybeLarrow = this.#peek();
    if (maybeLarrow.type !== 'larrow') {
      return outer;
    }
    expect('larrow');

    const inner: (string | TemplateType)[] = [];
    for (;;) {
      const part = this.#consumeType();
      inner.push(part);

      const next = expect(['rarrow', 'comma'], true);
      if (next.type === 'rarrow') {
        break;
      }
    }

    return { outer, inner };
  }
}
