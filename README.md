A simple library for working with Thrift-encoded data in JS.
Thrift is a lightweight format for encoding data&hellip; yada yada.
You're here because you need to work with its format.
We got your back!

This package includes a code generator that builds TypeScript classes from ".thrift" files, and helpers to read the compact binary Thrift format into those classes so you can get your job done.
It doesn't need native code, and is fast, typesafe and easy to use.

Originally, this project was written to parse the Thrift format used in Parquet.
It does not aim to support _all_ of the Thrift format.

## Usage

Install `thrift-tools` from NPM.
This package has zero dependencies^ and does not include any weird native code.

<small>^The package [`moo`](https://www.npmjs.com/package/moo) (BSD) is bundled for the code generator</small>

### Generating Code

You can convert a ".thrift" file to a helper&hellip;

TODO etc

