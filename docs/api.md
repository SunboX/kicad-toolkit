<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# API

## Entrypoints

`kicad-toolkit` exports the supported KiCad parser and renderer classes
from one entrypoint.

Specialized entrypoints are also available:

- `kicad-toolkit/parser`
- `kicad-toolkit/renderers`
- `kicad-toolkit/styles/kicad-renderers.css`

## Parser

```js
import {
    KicadPcbParser,
    KicadProjectLoader,
    SExpressionParser
} from 'kicad-toolkit/parser'
```

`KicadPcbParser.parse(source, options)` accepts KiCad `.kicad_pcb` source text
and returns the normalized board model described in
[Model Format](model-format.md). `options.fileName` is copied into the model for
host metadata and accessible renderer labels.

`KicadProjectLoader.loadFiles(files)` accepts browser `FileList` or `File[]`
values. `KicadProjectLoader.loadEntries(entries)` accepts named byte entries in
the shape `{ name, bytes }`. Both methods return `{ board, sourceFileName,
sourceText }` and support direct `.kicad_pcb` files plus ZIP files containing a
KiCad board.

`SExpressionParser.parse(source)` returns the raw nested S-expression tree used
by the KiCad parser.

## Renderers

```js
import { KicadStrokeFont, PcbSvgRenderer } from 'kicad-toolkit/renderers'
```

`PcbSvgRenderer.render(board, options)` returns deterministic SVG markup.
Passing `null` renders the empty drop prompt SVG. Supported renderer options
currently include `side`.

`KicadStrokeFont` exposes the stroke-font metrics and path construction used by
the SVG renderer.

Renderer output is deterministic string markup. The library does not attach DOM
events, mutate a host document, or perform downloads.
