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
- `kicad-toolkit/netlist-query`
- `kicad-toolkit/renderers`
- `kicad-toolkit/scene3d`
- `kicad-toolkit/workers/kicad-parser.worker.mjs`
- `kicad-toolkit/styles/kicad-renderers.css`

## Parser

```js
import { KicadParser } from 'kicad-toolkit/parser'

const circuitJson = KicadParser.parseArrayBuffer(fileName, arrayBuffer)
```

`fileName` is used to infer schematic or PCB parsing from the extension. The
parser accepts native `.kicad_sch` and `.kicad_pcb` bytes as an `ArrayBuffer`
and returns a Circuit JSON element array. The returned array carries
non-serialized renderer-compatibility fields such as `sourceFormat`, `kind`,
`fileType`, `schematic`, `pcb`, `summary`, `diagnostics`, and `bom` so existing
renderers can consume parser output directly during the migration.

PCB parsing reads KiCad S-expression board data, including layer declarations,
setup metadata, plot parameters, net declarations, footprints, legacy module
footprints, pads, graphical primitives, copper tracks, routed arcs, vias,
zones, groups, generated items, and title-block metadata. The wrapped
normalized PCB model keeps the raw KiCad board parser output available as
`pcb.kicadBoard` while projecting commonly used placement, pad, copper, BOM,
outline, layer, and summary fields into the Altium-style public model.

Schematic parsing reads KiCad S-expression sheet data, including sheet
metadata, symbols, embedded library graphics, labels, hierarchical sheets,
junctions, no-connect markers, graphical items, embedded file metadata, simple
net recovery, and grouped BOM rows.

```js
import { CircuitJsonModelSchema } from 'kicad-toolkit/parser'

if (!CircuitJsonModelSchema.isModel(circuitJson)) {
    throw new Error('Unsupported Circuit JSON model')
}
```

Use `KicadParser.parseArrayBufferToRendererModel(fileName, arrayBuffer)` when
an integration still needs the legacy renderer model object. The
`CircuitJsonModelAdapter` export also exposes `fromRendererModel()`,
`toRendererModel()`, and `isCircuitJson()` for explicit conversions. Legacy
renderer compatibility fields keep their `NormalizedModelSchema` id for
integrations that still check the normalized model contract.

`KicadPcbParser.parse(source, options)` accepts KiCad `.kicad_pcb` source text
and returns the lower-level board model that is wrapped by
`KicadParser.parseArrayBuffer()`. `options.fileName` is copied into the model
for host metadata and accessible renderer labels.

`KicadProjectLoader.loadFiles(files)` accepts browser `FileList` or `File[]`
values. `KicadProjectLoader.loadEntries(entries)` accepts named byte entries in
the shape `{ name, bytes }`. Both methods support direct `.kicad_pcb` files and
ZIP archives containing `.kicad_pro`, `.kicad_sch`, `.kicad_pcb`, and companion
3D asset files. Direct board loads return the raw board, Circuit JSON
documents, renderer compatibility documents, project summary, assets,
diagnostics, source file name, and source text. Full project loads return
Circuit JSON documents, renderer compatibility documents, a project summary,
companion assets, and diagnostics. Project summaries include
`rootSchematic` and ordered `pages` records for schematic hierarchy pages and
PCB documents.

Specialized parser helpers are exported for lower-level integrations, including
`Geometry`, `KicadArcGeometry`, `KicadLayerResolver`, `KicadNetResolver`,
`KicadPcbDrawingParser`, `KicadPcbLayerMetadata`, `KicadPcbPadParser`,
`KicadFeatureParity`, `KicadReadinessReport`, `KicadSchematicGraphicParser`,
`KicadSchematicSymbolParser`, `KicadToolkitCapabilities`, and
`SExpressionSchema` and `SExpressionTree`. The layer, net, drawing, pad,
schematic, report, capability, and S-expression helpers expose the same
normalization used by
`.kicad_pcb` and `.kicad_sch` parsing. `KicadFeatureParity` exposes a data-only
parity inventory for KiCad equivalents and source-format exemptions.
`SExpressionParser.parse(source)` returns the raw nested S-expression tree used
by the KiCad parsers. `SExpressionParser.parseWithMetadata(source)` returns the
same root tree plus generic structural metadata such as root name, token count,
node count, maximum depth, direct child-name counts, duplicate direct child
names, and scalar type counts. `SExpressionSchema` provides declarative
positional, child, flag, property-map, and value-reader helpers for reusable
node mapping with recoverable diagnostics.

`KicadLayerResolver` resolves standard KiCad aliases such as silkscreen and
courtyard display names, exposes standard ordinals, layer classes, copper
participation, and front/back/both side metadata, and handles wildcard layer
sets such as `*.Cu` and `*.Mask`. `KicadPcbLayerMetadata` applies that detail to
declared document layers and primitive layers while preserving the raw declared
layer names.

`Geometry` includes generic board-coordinate helpers for rotated rectangle
points, circle/segment/polygon descriptors, geometry bounds, and analytic edge
clearance between supported shapes. `KicadPcbPadParser.pointsForPad()` uses
those helpers so rotated rectangular pads and oval pads contribute accurate
bounds points to footprint and board bounds.

## Capabilities And Reports

```js
import {
    KicadFeatureParity,
    KicadReadinessReport,
    KicadToolkitCapabilities
} from 'kicad-toolkit/parser'

const parity = KicadFeatureParity.inventory()
const inventory = KicadToolkitCapabilities.inventory({
    category: 'reporting'
})
const drcSummary = KicadReadinessReport.summarizeDrcReport(drcJson)
const readiness = KicadReadinessReport.fabricationReadiness(
    documentModel.pcb.kicadBoard
)
```

`KicadToolkitCapabilities.inventory(options)` returns a read-only feature
matrix for parser, project-loading, geometry/metadata, rendering, 3D scene data,
and reporting support. Each capability record includes a safety class,
dependency list, browser and Node support flags, output shapes, dry-run support,
backup behavior, mutation behavior, and a short summary.
`KicadFeatureParity.inventory(options)` returns the auditable feature-level
parity contract against Altium Toolkit capabilities, including KiCad-native
feature records and source-format-specific exemptions.

`KicadReadinessReport.parseDrcReport(report, options)` and
`KicadReadinessReport.parseErcReport(report, options)` normalize
caller-supplied report JSON strings, objects, or arrays into consistent issue
records with counts by severity, rule, and category. The `summarizeDrcReport()`
and `summarizeErcReport()` variants return compact counts and examples.

`KicadReadinessReport.fabricationReadiness(input)` summarizes parsed board
readiness from recovered model data only. It reports blocker, warning, and info
findings for copper-layer availability, board outline presence and closure,
footprints, unrouted multi-pad nets, no-net pads, and visible 3D model metadata.
It does not invoke external commands or replace a complete design-rule,
electrical, or fabrication review.

See [Capabilities](capabilities.md) for the full inventory and report shapes.

## Netlist Query

```js
import { LoadedDesignNetlistService } from 'kicad-toolkit/netlist-query'

const service = new LoadedDesignNetlistService({
    getDocuments: () => [
        {
            id: 'active-sheet',
            active: true,
            documentModel
        }
    ]
})

const nets = service.searchNets({ pattern: 'i2c' })
```

The `netlist-query` entrypoint exposes browser-safe helpers for loaded document
inspection: `LoadedDesignNetlistService`, `QueryNetlistBuilder`,
`CircuitTraversal`, `ComponentGrouping`, `MPN_MISSING_NOTE`, and
`RegexPattern`.

The service accepts host-provided loaded document entries and returns plain
JSON-compatible query results. It can list designs, components, and nets; search
components by reference designator, MPN, or description; query one component's
pin connections; and trace extended connectivity from a net or `REFDES.PIN`.
Normal user-query failures return `{ error: string }`.

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
  It includes `externalPlacements` for resolved footprint 3D models, copper
  layer text in `detail.copperTexts`, and side-specific silkscreen detail with
  drill cutouts.
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
