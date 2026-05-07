<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# API

## Entrypoints

`kicad-toolkit` exports the supported KiCad parser, renderer, and 3D
scene-description classes from one entrypoint.

Specialized entrypoints are also available:

- `kicad-toolkit/parser`
- `kicad-toolkit/renderers`
- `kicad-toolkit/scene3d`
- `kicad-toolkit/workers/kicad-parser.worker.mjs`
- `kicad-toolkit/styles/kicad-renderers.css`

## Parser

```js
import { KicadParser } from 'kicad-toolkit/parser'

const documentModel = KicadParser.parseArrayBuffer(fileName, arrayBuffer)
```

`fileName` is used to infer schematic or PCB parsing from the extension. The
parser accepts `.kicad_sch` and `.kicad_pcb` bytes as an `ArrayBuffer` and
returns the normalized model described in [Model Format](model-format.md). Every
parser root includes a top-level `schema` id for the emitted normalized model
contract.

```js
import { NormalizedModelSchema } from 'kicad-toolkit/parser'

if (documentModel.schema !== NormalizedModelSchema.CURRENT_SCHEMA_ID) {
    throw new Error('Unsupported normalized model schema')
}
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

Specialized parser helpers are exported for lower-level integrations, including
`KicadArcGeometry`, `KicadNetResolver`, `KicadPcbDrawingParser`,
`KicadPcbPadParser`, `KicadSchematicGraphicParser`, and
`KicadSchematicSymbolParser`.

## Renderers

```js
import {
    SchematicSvgRenderer,
    PcbSvgRenderer,
    PcbSideResolvedRenderModel,
    preparePcbSideResolvedRenderModel,
    BomTableRenderer
} from 'kicad-toolkit/renderers'
```

- `SchematicSvgRenderer.render(documentModel)` returns schematic SVG markup.
- `PcbSvgRenderer.render(documentModel, options)` returns PCB SVG markup.
  Passing `null` renders the empty drop prompt SVG.
- `PcbSideResolvedRenderModel.resolve(documentModel, { side })` and
  `preparePcbSideResolvedRenderModel(documentModel, { side })` return a
  side-specific PCB render model. Use `side: 'back'` to render the back side
  with the same top-oriented renderer usage as Altium Toolkit.
- `BomTableRenderer.render(rows)` returns grouped BOM table markup.
- `KicadStrokeFont` exposes the stroke-font metrics and path construction used
  by the SVG renderer.

Renderer output is deterministic string markup. The library does not attach DOM
events, mutate a host document, or perform downloads.

## 3D Scene Data

```js
import {
    PcbScene3dBuilder,
    PcbScene3dModelRegistry,
    PcbScene3dPackages,
    PcbScene3dScenePreparator,
    PcbScene3dSummaryRenderer
} from 'kicad-toolkit/scene3d'
```

- `PcbScene3dBuilder.build(documentModel, options)` returns procedural board,
  placement, copper, and external-model scene-description data.
- `PcbScene3dModelRegistry` resolves companion 3D model candidates for KiCad
  component placements.
- `PcbScene3dPackages.resolve(component, padSpan)` resolves procedural package
  families and fallback dimensions.
- `PcbScene3dScenePreparator.prepare(documentModel, options)` prepares the same
  scene-description data behind an async API suitable for host workers.
- `PcbScene3dSummaryRenderer.render(documentModel)` returns static 3D summary
  HTML.

The library intentionally does not create Three.js objects, canvases, controls,
or event listeners.
