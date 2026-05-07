<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# API

## Entrypoints

`kicad-toolkit` exports the supported parser, renderer, and 3D
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
parser accepts native `.kicad_sch` and `.kicad_pcb` bytes as an `ArrayBuffer`
and returns the normalized model described in [Model Format](model-format.md).
Every parser root includes a top-level `schema` id for the emitted normalized
model contract.

PCB parsing reads KiCad S-expression board data, including layer declarations,
net declarations, footprints, pads, graphical primitives, copper tracks, routed
arcs, vias, zones, groups, generated items, and title-block metadata. The
wrapped normalized PCB model keeps the raw KiCad board parser output available
as `pcb.kicadBoard` while projecting commonly used placement, pad, copper, BOM,
outline, and summary fields into the Altium-style public model.

Schematic parsing reads KiCad S-expression sheet data, including sheet
metadata, symbols, embedded library graphics, labels, hierarchical sheets,
junctions, no-connect markers, graphical items, embedded file metadata, simple
net recovery, and grouped BOM rows.

```js
import { NormalizedModelSchema } from 'kicad-toolkit/parser'

if (documentModel.schema !== NormalizedModelSchema.CURRENT_SCHEMA_ID) {
    throw new Error('Unsupported normalized model schema')
}
```

`KicadPcbParser.parse(source, options)` accepts KiCad `.kicad_pcb` source text
and returns the lower-level board model that is wrapped by
`KicadParser.parseArrayBuffer()`. `options.fileName` is copied into the model
for host metadata and accessible renderer labels.

`KicadProjectLoader.loadFiles(files)` accepts browser `FileList` or `File[]`
values. `KicadProjectLoader.loadEntries(entries)` accepts named byte entries in
the shape `{ name, bytes }`. Both methods support direct `.kicad_pcb` files and
ZIP archives containing `.kicad_pro`, `.kicad_sch`, `.kicad_pcb`, and companion
3D asset files. Direct board loads return the raw board, wrapped documents,
project summary, assets, diagnostics, source file name, and source text. Full
project loads return parsed documents, a project summary, companion assets, and
diagnostics.

Specialized parser helpers are exported for lower-level integrations, including
`Geometry`, `KicadArcGeometry`, `KicadLayerResolver`, `KicadNetResolver`,
`KicadPcbDrawingParser`, `KicadPcbPadParser`,
`KicadSchematicGraphicParser`, and `KicadSchematicSymbolParser`. The layer,
net, drawing, pad, and schematic helpers expose the same normalization used by
`.kicad_pcb` and `.kicad_sch` parsing. `SExpressionParser.parse(source)`
returns the raw nested S-expression tree used by the KiCad parsers.

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
  side-specific PCB render model for top-oriented renderers. Use
  `side: 'back'` to project bottom components, documentation layers, copper
  primitives, vias, pad geometry, and KiCad stroke text into the top-facing
  render surface.
- `BomTableRenderer.render(rows)` returns grouped BOM table markup.
- `KicadStrokeFont` exposes the stroke-font metrics and path construction used
  by the SVG renderer.

Renderer output is deterministic string markup. The library does not attach DOM
events or mutate a host document.

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
  placement, copper, text, zone, and external-model scene-description data.
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
