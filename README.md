Work with Thrift-encoded data in JS/TS.

Thrift is a lightweight format for encoding data&hellip; yada yada.
You're here because you need to work with its format.

This package includes a code generator that builds TypeScript classes from ".thrift" definition files, and helpers to read the compact binary Thrift format into those classes so you can get your job done.
It doesn't need native code, and is fast, typesafe and easy to use.

<small>
Originally, this project was written to parse the Thrift format used in Parquet.
It does not aim to support _all_ of the Thrift format but features can be requested if you need them.
</small>

## Usage

Install `thrift-tools` from NPM.
This package has zero dependencies and does not include any native bindings.

### Generating Code

You can convert a ".thrift" file to a helper by running the script:

```bash
npx thrift-tools codegen <path/to/your/definition-file.thrift>
```

This will output TS to your console, which you can then save to a file or do further processing on.
The output code imports some helpers from this package `thrift-tools`, which you can bundle in a build.

You can also import the parser programatically:

```ts
import { renderThrift } from 'thrift-tools/codegen';
const out = renderThrift(`struct Foo { 1: string foo; 2: required list<i32> bar; }`);
// do something with the TS code in "out"
```

This generates TypeScript.
If your project is pure JS, you'll need to rewrite the generated file at this point.

### Using Generated Code

The generated code will typically contain a number of `class` definitions.
The simple example abvove will export `class Foo` with two properties.

To read a `Foo` from a buffer, you can import a concrete parser and read from a buffer:

```ts
import { Foo } from './your-codegen-code.ts';
import { CompactProtocolReader } from 'thrift-tools';

const buffer = new Uint8Array(/* TODO: get from disk or network */);

const f = new Foo();
f.read(new CompactProtocolReader(buffer));

// f is now read from the buffer \o/
```

The reader and generated code are pure JS and will work in the browser, Node, or any other environment.

### Read Thrift Wire Format

In some cases you might want to read values from the Thrift wire format directly, rather than specifically into a generated class.
You can still use `CompactProtocolReader`:

```ts
import { CompactProtocolReader } from 'thrift-tools';

const buffer = new Uint8Array(/* TODO: get from disk or network */);
const reader = new CompactProtocolReader(buffer);

const number = reader.readI32();
const double = reader.readDouble();
```

For example, the [`Message`](https://github.com/apache/thrift/blob/master/doc/specs/thrift-compact-protocol.md#message) in Thrift is just a number of adjacent types, rather than a `struct` on the wire.

## Unsupported Features

These tools don't yet support:

- const in thrift files
- service definitions
- lots of other things

I'm happy to accept requests.
