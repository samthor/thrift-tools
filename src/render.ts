import { CompactProtocolType } from './deps/compiler-deps.js';
import type { RenderOptions } from './options.js';
import { type ObjectType, ThriftFile, TemplateType } from './parser.js';

type RenderContext = {
  options: Required<RenderOptions>;
  tf: ThriftFile;
};

export function renderRo(tf: ThriftFile | string, sourceOptions: RenderOptions = {}) {
  if (typeof tf === 'string') {
    const source = tf;
    tf = new ThriftFile();
    tf.parse(source);
  }

  const rc: RenderContext = {
    options: Object.assign(
      {
        zeroInstance: true,
        toolImport: 'thrift-tools',
      },
      sourceOptions,
    ),
    tf,
  };

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
          const t = typeToTS(rc, r.type);
          if (r.required || r.defaultValue) {
            return `  ${name}: ${t.type} = ${r.defaultValue ?? t.default};`;
          }
          return `  ${name}?: ${t.type};`;
        }),
      );

      // reader
      const r = constructReaderFor(rc, o);
      const innerLines = r.split('\n');
      lines.push(`  read(input: ThriftReader): ${name} {`);
      lines.push(...innerLines.map((x) => (`    ` + x).trimEnd()));
      lines.push(`  }`);

      lines.push(`}`);

      // create default instance as there's no fields here
      if (rc.options.zeroInstance && e.length === 0) {
        lines.push(`const _${name}_zeroInstance = new ${name}();`);
      }
    }

    return lines.join('\n') + '\n\n';
  });

  const preamble =
    `import { type ThriftReader, readList, readMap } ` +
    `from ${JSON.stringify(rc.options.toolImport)};\n\n`;
  parts.unshift(preamble);
  return parts.join('');
}

function constructReaderFor(rc: RenderContext, o: ObjectType) {
  const switchCode = Object.entries(o.records).map(([name, or]) => {
    const t = typeToTS(rc, or.type);
    const key = (or.fieldId << 8) + t.thrift;

    const lines: string[] = [];
    lines.push(`    case ${key}:`);
    lines.push(`      this.${name} = ${t.reader};`);
    lines.push('      break;');
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
      `  const key = input.readStructKey();`,
      `  switch (key) {`,
      `    case 0:`,
      `      return this;`,
      ...switchCode.flat(),
      `    default:`,
      `      input.skip(key & 0xff);`,
      `  }`,
      `}`,
    ];
  }

  return lines.join('\n');
}

type ConvertedType = {
  type: string;
  default: string;
  reader: string;
  thrift: CompactProtocolType;
};

function typeToTS(rc: RenderContext, type: string | TemplateType): ConvertedType {
  if (typeof type !== 'string') {
    return templateTypeToTS(rc, type);
  }

  switch (type) {
    case 'i8':
      return {
        type: 'number',
        default: '0',
        reader: 'input.readByte()',
        thrift: CompactProtocolType.CT_BYTE,
      };

    case 'i16':
      return {
        type: 'number',
        default: '0',
        reader: 'input.readI16()',
        thrift: CompactProtocolType.CT_I16,
      };

    case 'i32':
      return {
        type: 'number',
        default: '0',
        reader: 'input.readI32()',
        thrift: CompactProtocolType.CT_I32,
      };

    case 'i64':
      return {
        type: 'number',
        default: '0',
        reader: 'input.readI64()',
        thrift: CompactProtocolType.CT_I64,
      };

    case 'bool':
      return {
        type: 'boolean',
        default: 'false',
        reader: 'input.readBool()',
        thrift: CompactProtocolType.CT_BOOLEAN_FALSE_OR_TYPE,
      };

    case 'binary':
      return {
        type: 'Uint8Array',
        default: 'new Uint8Array()',
        reader: 'input.readBinary()',
        thrift: CompactProtocolType.CT_BINARY,
      };

    case 'uuid':
      return {
        type: 'Uint8Array',
        default: 'new Uint8Array()',
        reader: 'input.readUUID()',
        thrift: CompactProtocolType.CT_UUID,
      };

    case 'string':
      return {
        type: 'string',
        default: `''`,
        reader: 'input.readString()',
        thrift: CompactProtocolType.CT_BINARY,
      };
  }

  const r = rc.tf.types[type];
  if (r === undefined) {
    throw new Error(`unknown type: ${type}`);
  }

  if (r.type === 'enum') {
    // choose a sensible default
    const first = firstEntryOf(r.options);
    return {
      type,
      default: `${type}.${first[0]}`,
      reader: 'input.readI32()',
      thrift: CompactProtocolType.CT_I32,
    };
  }

  // We can short-circuit for zero instance.
  let structDefault = `new ${type}()`;
  if (rc.options.zeroInstance && Object.entries(r.records).length === 0) {
    structDefault = `_${type}_zeroInstance`;
  }
  let structReader = `${structDefault}.read(input)`;

  // assume struct now
  return {
    type,
    default: structDefault,
    reader: structReader,
    thrift: CompactProtocolType.CT_STRUCT,
  };
}

function templateTypeToTS(rc: RenderContext, type: TemplateType): ConvertedType {
  const inner = type.inner.map((t) => typeToTS(rc, t));

  switch (type.outer) {
    case 'map': {
      if (inner.length !== 2) {
        break;
      }
      const [key, value] = inner;
      const mkey = (key.thrift << 4) + value.thrift;
      return {
        type: `Map<${key.type}, ${value.type}>`,
        default: `new Map()`,
        reader: `readMap(input, ${mkey}, () => ${key.reader}, () => ${value.reader})`,
        thrift: CompactProtocolType.CT_MAP,
      };
    }

    case 'set': {
      if (type.inner.length !== 1) {
        break;
      }
      return {
        type: `Set<${inner[0].type}>`,
        default: 'new Set()',
        reader: `new Set(readList(input, ${inner[0].thrift}, () => ${inner[0].reader}))`,
        thrift: CompactProtocolType.CT_SET,
      };
    }

    case 'list': {
      if (type.inner.length !== 1) {
        break;
      }
      const [etype] = inner;

      return {
        type: `Array<${inner[0].type}>`,
        default: '[]',
        reader: `readList(input, ${inner[0].thrift}, () => ${inner[0].reader})`,
        thrift: CompactProtocolType.CT_LIST,
      };
    }
  }

  throw new Error(`unsupported template type: ${JSON.stringify(type)}`);
}

function firstEntryOf<X extends string | number | symbol, Y>(o: Record<X, Y>): [X, Y] {
  for (const key in o) {
    return [key, o[key]];
  }
  throw new Error(`no entries in record: ${o}`);
}
