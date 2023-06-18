import { ThriftFile } from './parser.js';

export function renderRo(tf: ThriftFile) {
  const parts = Object.entries(tf.types).map(([name, o]) => {
    const lines: string[] = [];

    // lines.push(`// ${o.type} ${name}`);

    if (o.type === 'enum') {
      lines.push(`enum ${name} {`);
      lines.push(...Object.entries(o.options).map(([name, r]) => {
        return `  ${name} = ${r};`;
      }));
      lines.push(`}`);
    } else {
      lines.push(`class ${name} {`);

      const e = Object.entries(o.records);

      // property definitions
      lines.push(...e.map(([name, r]) => {
        const t = typeToTS(r.type);
        if (r.required) {
          return `  ${name}: ${t.type} = ${t.default};`;
        }
        return `  ${name}?: ${t.type};`;
      }));

      lines.push(`}`);
    }

    return lines.join('\n') + '\n\n';
  });

  return parts.join('');

}

function typeToTS(type: string): { type: string, default: string } {
  switch (type) {
    case 'i8':
    case 'i16':
    case 'i32':
    case 'i64':
      return { type: 'number', default: '0' };

    case 'bool':
      return { type: 'boolean', default: 'false' };

    case 'binary':
      return { type: 'Uint8Array', default: 'new Uint8Array()' };
  }

  if (type.startsWith('list<')) {
    if (!type.endsWith('>')) {
      throw new Error(`invalid list: ${type}`);
    }

    const innerRaw = type.substring(5, type.length - 1);
    const inner = typeToTS(innerRaw);

    return { type: `Array<${inner.type}>`, default: '[]' };
  }

  if (type.includes('<')) {
    throw new Error(`unsupported template type: ${type}`);
  }

  // TODO: this is wrong because type might be an enum - just a number
  return { type, default: `new ${type}()` };
}
