import { ObjectType, ThriftFile } from './parser.js';

// Not required for compact protocol
const INCLUDE_COMPACT_NOOP = false;

const preamble = `import { type ThriftReader, readList } from './compiler-deps.ts';\n\n`;

export function renderRo(tf: ThriftFile) {
  const parts = Object.entries(tf.types).map(([name, o]) => {
    const lines: string[] = [];

    lines.push(`// ${o.type} ${name}`);

    if (o.type === 'enum') {
      lines.push(`export enum ${name} {`);
      lines.push(
        ...Object.entries(o.options).map(([name, r]) => {
          return `  ${name} = ${r},`;
        }),
      );
      lines.push(`}`);
    } else {
      lines.push(`export class ${name} {`);

      const e = Object.entries(o.records);

      // property definitions
      lines.push(
        ...e.map(([name, r]) => {
          const t = typeToTS(tf, r.type);
          if (r.required) {
            return `  ${name}: ${t.type} = ${t.default};`;
          }
          return `  ${name}?: ${t.type};`;
        }),
      );

      // reader
      const r = constructReaderFor(tf, o);
      const innerLines = r.split('\n');
      lines.push(`  read(input: ThriftReader): ${name} {`);
      lines.push(...innerLines.map((x) => (`    ` + x).trimEnd()));
      lines.push(`  }`);

      lines.push(`}`);

      // create default instance as there's no fields here
      if (e.length === 0) {
        lines.push(`const _${name}_zeroInstance = new ${name}();`);
      }
    }

    return lines.join('\n') + '\n\n';
  });

  parts.unshift(preamble);
  return parts.join('');
}

function constructReaderFor(tf: ThriftFile, o: ObjectType) {
  const switchCode = Object.entries(o.records).map(([name, or]) => {
    const t = typeToTS(tf, or.type);
    const key = (or.fieldId << 8) + t.thrift;

    const lines: string[] = [];
    lines.push(`    case ${key}: {`);
    lines.push(`      this.${name} = ${t.reader};`);
    lines.push('      break;');
    lines.push('    }');
    return lines.join('\n');
  });

  let lines: string[];

  if (switchCode.length === 0) {
    // special-case no valid fields
    lines = [`input.skip(12);`, `return this;`];
  } else {
    lines = [
      `input.readStructBegin();`,
      `for (;;) {`,
      `  const key = input.readFieldKey();`,
      `  switch (key) {`,
      `    case 0: {`,
      `      input.readStructEnd();`,
      `      return this;`,
      `    }`,
      ...switchCode.flat(),
      `    default: {`,
      `      input.skip(ftype);`,
      `    }`,
      `  }`,
      INCLUDE_COMPACT_NOOP ? `  input.readFieldEnd();` : '  // skip readFieldEnd',
      `}`,
    ];
  }

  return lines.join('\n');
}

type ConvertedType = {
  type: string;
  default: string;
  reader: string;
  thrift: number;
  wrap?: ConvertedType;
};

function typeToTS(tf: ThriftFile, type: string): ConvertedType {
  switch (type) {
    case 'i8':
      return { type: 'number', default: '0', reader: 'input.readByte()', thrift: 3 };

    case 'i16':
      return { type: 'number', default: '0', reader: 'input.readI16()', thrift: 6 };

    case 'i32':
      return { type: 'number', default: '0', reader: 'input.readI32()', thrift: 8 };

    case 'i64':
      return { type: 'number', default: '0', reader: 'input.readI64()', thrift: 10 };

    case 'bool':
      return { type: 'boolean', default: 'false', reader: 'input.readBool()', thrift: 2 };

    case 'binary':
      return {
        type: 'Uint8Array',
        default: 'new Uint8Array()',
        reader: 'input.readBinary()',
        thrift: 11,
      };

    case 'string':
      return { type: 'string', default: `''`, reader: 'input.readString()', thrift: 11 };
  }

  if (type.startsWith('list<')) {
    if (!type.endsWith('>')) {
      throw new Error(`invalid list: ${type}`);
    }

    const innerRaw = type.substring(5, type.length - 1);
    const inner = typeToTS(tf, innerRaw);

    const reader = `readList(input, ${inner.thrift}, () => ${inner.reader})`;
    return {
      type: `Array<${inner.type}>`,
      default: '[]',
      reader,
      thrift: 15,
      wrap: inner,
    };
  }

  if (type.includes('<')) {
    throw new Error(`unsupported template type: ${type}`);
  }

  const r = tf.types[type];
  if (r === undefined) {
    throw new Error(`unknown type: ${type}`);
  }

  if (r.type === 'enum') {
    // choose a sensible default
    const first = firstEntryOf(r.options);
    return { type, default: `${type}.${first[0]}`, reader: 'input.readI32()', thrift: 8 };
  }

  // We can short-circuit for zero instance.
  let structDefault = `new ${type}()`;
  if (Object.entries(r.records).length === 0) {
    structDefault = `_${type}_zeroInstance`;
  }
  let structReader = `${structDefault}.read(input)`;

  // assume struct now
  return { type, default: structDefault, reader: structReader, thrift: 12 };
}

function firstEntryOf<X extends string | number | symbol, Y>(o: Record<X, Y>): [X, Y] {
  for (const key in o) {
    return [key, o[key]];
  }
  throw new Error(`no entries in record: ${o}`);
}
