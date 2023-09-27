import { CompactProtocolType } from './deps/compiler-deps.js';
import type { RenderOptions } from './options.js';
import { type ObjectType, ThriftFile, TemplateType } from './parser.js';

type RenderContext = {
  options: Required<RenderOptions>;
  tf: ThriftFile;
  hasList?: true;
  hasMap?: true;
  hasStruct?: true;
};

export function renderThrift(tf: ThriftFile | string, sourceOptions: RenderOptions = {}) {
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
        includeWriter: false,
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
      rc.hasStruct = true;
      lines.push(`export class ${name} {`);

      const e = Object.entries(o.records);

      // property definitions
      lines.push(
        ...e.map(([name, r]) => {
          const t = typeToTS(rc, r.type);
          if (r.required || r.defaultValue) {
            const defaultValue = cooerceDefault(t.type, r.defaultValue ?? t.default);
            return `  ${name}: ${t.type} = ${defaultValue};`;
          }
          return `  ${name}?: ${t.type};`;
        }),
      );

      // reader
      const readerLines = constructReaderFor(rc, o);
      lines.push(`  read(input: ThriftReader): ${name} {`);
      lines.push(...readerLines.map((x) => (`    ` + x).trimEnd()));
      lines.push(`  }`);

      if (rc.options.includeWriter) {
        const writerLines = constructWriterFor(rc, o);
        lines.push(`  write(output: ThriftWriter): ${name} {`);
        lines.push(...writerLines.map((x) => (`    ` + x).trimEnd()));
        lines.push(`  }`);
      }

      lines.push(`}`);

      // create default instance as there's no fields here
      if (rc.options.zeroInstance && e.length === 0) {
        lines.push(`const _${name}_zeroInstance = new ${name}();`);
      }
    }

    return lines.join('\n') + '\n\n';
  });

  // Generate the optional preamble. This imports from the `toolImport` path, by default this
  // package's default exports, for helpers (or possibly just types).

  let imports: string[] = [];
  let typeOnly = false;

  if (rc.hasList || rc.hasMap) {
    // has at least one of list/map (and will have struct) and needs helpers
    imports.push('type ThriftReader');
    rc.hasList && imports.push('readList');
    rc.hasMap && imports.push('readMap');

    if (rc.options.includeWriter) {
      imports.push('type ThriftWriter');
      rc.hasMap && imports.push('writeMap');
    }
  } else if (rc.hasStruct) {
    // no list/map but still has structs, import the types
    typeOnly = true;
    imports.push('ThriftReader');
    if (rc.options.includeWriter) {
      imports.push('ThriftWriter');
    }
  }

  if (imports.length) {
    const leftPart = `import ` + (typeOnly ? 'type ' : '');
    const importPart = '{ ' + imports.join(', ') + ' }';
    const preamble = leftPart + importPart + `from ${JSON.stringify(rc.options.toolImport)}\n\n`;
    parts.unshift(preamble);
  }

  return parts.join('');
}

function constructWriterFor(rc: RenderContext, o: ObjectType) {
  const lines = [
    `output.writeStructBegin();`,

    ...Object.entries(o.records).map(([name, or]) => {
      const t = typeToTS(rc, or.type);
      let lines = [
        `output.writeStructKey(${t.thrift}, ${or.fieldId});`,
        t.writer(`this.${name}`) + ';',
      ];

      if (!or.required) {
        lines = lines.map((x) => '  ' + x);
        lines.unshift(`if (this.${name} !== undefined) {`);
        lines.push('}');
      }

      return lines;
    }),

    `output.writeStructKey(0, 0);`,
  ].flat();
  return lines;
}

function constructReaderFor(rc: RenderContext, o: ObjectType) {
  const switchCode = Object.entries(o.records).map(([name, or]) => {
    const t = typeToTS(rc, or.type);
    const key = (or.fieldId << 8) + t.thrift;

    const lines: string[] = [];
    lines.push(`    case ${key}:`);
    lines.push(`      this.${name} = ${t.reader};`);
    lines.push('      break;');
    return lines;
  });

  let lines: string[];

  if (switchCode.length === 0) {
    // special-case no valid fields
    lines = [`input.skip(${CompactProtocolType.CT_STRUCT});`, `return this;`];
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

  return lines;
}

type ConvertedType = {
  type: string;
  default: string;
  reader: string;
  writer: (v: string) => string;
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
        writer: (x) => `output.writeByte(${x})`,
        thrift: CompactProtocolType.CT_BYTE,
      };

    case 'i16':
      return {
        type: 'number',
        default: '0',
        reader: 'input.readI16()',
        writer: (x) => `output.writeI16(${x})`,
        thrift: CompactProtocolType.CT_I16,
      };

    case 'i32':
      return {
        type: 'number',
        default: '0',
        reader: 'input.readI32()',
        writer: (x) => `output.writeI32(${x})`,
        thrift: CompactProtocolType.CT_I32,
      };

    case 'i64':
      return {
        type: 'number',
        default: '0',
        reader: 'input.readI64()',
        writer: (x) => `output.writeI64(${x})`,
        thrift: CompactProtocolType.CT_I64,
      };

    case 'bool':
      return {
        type: 'boolean',
        default: 'false',
        reader: 'input.readBool()',
        writer: (x) => `output.writeBool(${x})`,
        thrift: CompactProtocolType.CT_BOOLEAN_FALSE_OR_TYPE,
      };

    case 'binary':
      return {
        type: 'Uint8Array',
        default: 'new Uint8Array()',
        reader: 'input.readBinary()',
        writer: (x) => `output.writeBinary(${x})`,
        thrift: CompactProtocolType.CT_BINARY,
      };

    case 'uuid':
      return {
        type: 'Uint8Array',
        default: 'new Uint8Array()',
        reader: 'input.readUUID()',
        writer: (x) => `output.writeUUID(${x})`,
        thrift: CompactProtocolType.CT_UUID,
      };

    case 'string':
      return {
        type: 'string',
        default: `''`,
        reader: 'input.readString()',
        writer: (x) => `output.writeString(${x})`,
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
      writer: (x) => `output.writeI32(${x})`,
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
    writer: (x) => `${x}.write(output)`,
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
      rc.hasMap = true;
      const [key, value] = inner;
      const mkey = (key.thrift << 4) + value.thrift;
      return {
        type: `Map<${key.type}, ${value.type}>`,
        default: `new Map()`,
        reader: `readMap(input, ${mkey}, () => ${key.reader}, () => ${value.reader})`,
        writer: (x) =>
          `writeMap(output, ${mkey}, ${x}, (k) => ${key.writer('k')}, (v) => ${value.writer('v')})`,
        thrift: CompactProtocolType.CT_MAP,
      };
    }

    case 'set': {
      if (type.inner.length !== 1) {
        break;
      }
      rc.hasList = true;
      const [etype] = inner;
      return {
        type: `Set<${etype.type}>`,
        default: 'new Set()',
        reader: `new Set(readList(input, ${etype.thrift}, () => ${etype.reader}))`,
        writer: buildIteratorWriter(etype),
        thrift: CompactProtocolType.CT_SET,
      };
    }

    case 'list': {
      if (type.inner.length !== 1) {
        break;
      }
      rc.hasList = true;
      const [etype] = inner;
      return {
        type: `Array<${etype.type}>`,
        default: '[]',
        reader: `readList(input, ${etype.thrift}, () => ${etype.reader})`,
        writer: buildIteratorWriter(etype),
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

function cooerceDefault(type: string, cand: string | number) {
  if (type === 'boolean') {
    return Boolean(cand);
  }
  return String(cand);
}

function buildIteratorWriter(etype: ConvertedType) {
  return (x: string) =>
    `(output.writeListHeader(${etype.thrift}, ${x}.length), ` +
    `${x}.forEach((e) => ${etype.writer('e')}))`;
}
