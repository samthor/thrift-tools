#!/bin/bash

set -eu

rm -rf dist/

for X in src/entrypoint/*.ts; do
  BASE=$(basename $X)
  FILENAME="${BASE%.*}"
  esbuild --platform=node --bundle --format=esm --outfile=dist/${FILENAME}.js src/entrypoint/${BASE}
done
