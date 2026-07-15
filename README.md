<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# KiCad Toolkit

KiCad Toolkit is the native KiCad adapter in the common ECAD toolkit family. It
parses KiCad sources into immutable CircuitJSON document envelopes and exposes
the same parser, project, renderer, interaction, query, manufacturing,
simulation, 3D scene, capability, error, and worker contracts as
`circuitjson-toolkit`, `gerber-toolkit`, and `altium-toolkit`.

The package was extracted from [PCB Styler](https://pcb-styler.app/), where it
is used for browser-based KiCad board/project loading and deterministic render
output, and it is also used in [ECAD Forge](https://ecadforge.app/). Its parser
behavior, normalized model shape, project ZIP loading, and renderer output can
be reused by other browser or Node-based tools.

## Breaking API convergence

Version 1.1.0 intentionally changes root names, parameters, return shapes, and
package subpaths. `Parser.parse()` now accepts `{ fileName, data }` and returns
an `ecad-toolkit.document.v1` envelope with dense CircuitJSON in `model`.
`ProjectLoader` accepts `{ name, data }` entries and expands ZIP input itself.

Version 1.1.1 completes exact subpath parity: `kicad-toolkit/parser` includes
the shared `CircuitJsonDocumentContext`, and `kicad-toolkit/project` includes
the shared `ZipArchiveInspector`. Their identities match the exports from
`circuitjson-toolkit`, while KiCad's `Parser` and `ProjectLoader` remain the
format-owned implementations also exported at the package root. See the
[1.1.1 release notes](docs/release-notes-v1.1.1.md).

Version 1.1.2 makes every projected PCB element valid against the pinned
CircuitJSON schema. It preserves legacy footprint values, derives required
passive and connector properties, retains footprint ownership for artwork,
and maps board notes and courtyard geometry to their canonical CircuitJSON
types. See the [1.1.2 release notes](docs/release-notes-v1.1.2.md).

Version 1.1.3 fixes the complete browser-worker path for multi-entry projects
and binary assets. Worker requests now carry only the common public entry
fields, derive byte accounting on the receiving side, and honor
`transferInput` exactly like the other toolkits. See the
[1.1.3 release notes](docs/release-notes-v1.1.3.md).

Version 1.1.4 adds `KicadExtensionResolver` as the explicit bridge from a
canonical document envelope to retained source-native renderer data. Apps can
request `kicad.native-model`, use native KiCad 2D rendering where source
fidelity matters, and keep CircuitJSON for shared queries, BOM, and fast 3D
scene construction. See the
[1.1.4 release notes](docs/release-notes-v1.1.4.md).

Version 1.1.5 republishes the same runtime behavior with the clean-checkout
formatting gate corrected. See the
[1.1.5 release notes](docs/release-notes-v1.1.5.md).

Version 1.2.0 preserves exact KiCad pad, drill, silkscreen, and PCB text
geometry in the canonical CircuitJSON model. Oval and slotted drills, custom
and rounded pads, filled silkscreen artwork, independent text dimensions,
source anchors, and mirroring now flow directly to common renderers. See the
[1.2.0 release notes](docs/release-notes-v1.2.0.md).

Version 1.3.0 adopts newly decoded CircuitJSON and native extension graphs at
the shared validation boundary. Their ordinary nodes retain identity and are
deeply frozen without a redundant defensive graph copy. Parser parameters,
document envelopes, extension fields, and return shapes remain unchanged. See
the [1.3.0 release notes](docs/release-notes-v1.3.0.md).

Version 1.3.1 restores bottom-side SMD pads at the canonical CircuitJSON
boundary. Pad layer, dimensions, shape, corner radius, solder-mask state, and
component ownership now come from the authored copper face, so shared 2D and
3D consumers receive complete top and bottom geometry. See the
[1.3.1 release notes](docs/release-notes-v1.3.1.md).

No KiCad feature was removed. The complete browser-safe 1.0.29 API remains at
`kicad-toolkit/extensions`; Node-only and native netlist-query helpers have
explicit extension subpaths. See the [migration guide](docs/migration.md).

## Features

- Exact common root and package layout with direct ECAD Forge/viewer
  compatibility and no format-specific app adapter
- One-parse CircuitJSON document envelopes plus common project envelopes,
  assets, typed errors, progress, cancellation, workers, and archive limits
- Async parser and project paths own exact byte windows and selected asset
  payloads before any progress callback or host turn. Project candidates fail
  independently, so one malformed document does not discard valid siblings.
- Shared CircuitJSON rendering, interaction, query, manufacturing, simulation,
  and right-handed Z-up 3D scene services
- Opt-in `kicad.native-model` retention with a guarded resolver for native
  schematic, PCB, layer, and interaction fidelity without reparsing
- Canonical `cad_component` rows for every visible footprint model, with exact
  project asset paths and independent board-placement and model-local
  transforms for direct viewer and ECAD Forge consumption
- Parse standalone native `.kicad_sch` and `.kicad_pcb` files from
  `ArrayBuffer`
- Parse standalone `.kicad_mod`, `.kicad_sym`, `fp-lib-table`,
  `sym-lib-table`, `.kicad_jobset`, `.kicad_dru`, `.kicad_wks`, `.net`,
  `.cmp`, legacy `.lib`/`.dcm`/`.mod`, and KiCad library/design-block manifests
- Load browser `File` objects or named byte entries from KiCad board files and
  project ZIP archives with central-directory preflight, path/depth/size/ratio
  limits, and extracted CRC32 verification
- Recover schematic symbols, sheet symbols, labels, nets, graphical items,
  embedded schematic metadata, board outlines, declared board layers, setup and
  plot metadata, footprints, legacy module footprints, pads, copper segments,
  vias, zones, drawings, text, layer side/class metadata, and board bounds
- Project schematic rectangles, circles, arcs, Beziers, polygons, text boxes,
  tables, child-sheet symbols, and images into shared CircuitJSON. Embedded
  images use canonical ToolkitAsset payloads instead of inline base64.
- Resolve standard KiCad layer aliases, ordinals, classes, copper participation,
  wildcard sides, rotated pad bounds, and analytic geometry clearances
- Expose a read-only parser/rendering capability inventory and normalized
  DRC/ERC/readiness report helpers for host diagnostics
- Search KiCad libraries, build deterministic library render manifests, digest
  KiCad jobsets, inventory embedded/companion assets, and report
  schematic-local connectivity QA findings
- Build project document graphs and deterministic CI artifact bundles, validate
  semantic SVG/model cross-links, and run deterministic parser compatibility
  smoke cases
- Expose an auditable feature-level parity inventory against Altium Toolkit
  capabilities, including explicit source-format exemptions
- Expose renderer helper APIs for KiCad SVG formatting, semantic metadata,
  schematic project parameters, and stroke-text metrics
- Preserve raw KiCad board detail through the wrapped `pcb.kicadBoard` model so
  lower-level KiCad parser output remains inspectable
- Emit Circuit JSON arrays from parser roots, including connected PCB routes,
  endpoint ports, vias, copper pours, board cutouts, and non-serialized
  renderer-compatibility fields for existing consumers
- Preserve face-specific top and bottom SMD pad geometry, solder-mask openings,
  and valid component ownership in canonical CircuitJSON
- Render schematic SVG, PCB SVG, and grouped BOM HTML
- Build non-interactive PCB 3D scene-description data for host applications,
  including full companion model payloads, multiple models per footprint,
  copper text detail, and silkscreen drill cutouts
- Render KiCad stroke text and a static 3D board summary
- Run entirely with local input data; no network calls are made by the parser

## Install

The package is published on npm as
[`kicad-toolkit`](https://www.npmjs.com/package/kicad-toolkit).

```bash
npm install kicad-toolkit
```

## Usage

```js
import {
    CircuitJsonDocumentContext,
    Parser,
    PcbInteractionIndex,
    PcbScene3dBuilder,
    SchematicSvgRenderer,
    PcbSvgRenderer,
    QueryService
} from 'kicad-toolkit'

const document = await Parser.parseAsync(
    { fileName: file.name, data: await file.arrayBuffer() },
    { worker: 'auto' }
)
const context = CircuitJsonDocumentContext.prepare(document, {
    indexes: ['elements', 'relations', 'connectivity', 'spatial']
})

const schematicMarkup = SchematicSvgRenderer.render(context)
const pcbMarkup = PcbSvgRenderer.render(context, { side: 'bottom' })
const hits = PcbInteractionIndex.create(context).hitTest({ x: 10, y: 5 })
const components = QueryService.create(context).query({ select: 'components' })
const sceneDescription = PcbScene3dBuilder.build(context)

console.log(document.model, schematicMarkup, pcbMarkup, hits, components.items)
```

Load app-shaped project entries or one ZIP blob directly:

```js
import { ProjectLoader } from 'kicad-toolkit/project'

const project = await ProjectLoader.loadAsync([
    { name: 'design.zip', data: zipArrayBuffer }
])
```

Use the retained native API deliberately when needed:

```js
import { Parser } from 'kicad-toolkit/parser'
import {
    KicadExtensionResolver,
    PcbSvgRenderer as KicadPcbSvgRenderer
} from 'kicad-toolkit/extensions'

const document = Parser.parse(
    { fileName: file.name, data: arrayBuffer },
    { extensions: ['kicad.native-model'] }
)
const nativeModel = KicadExtensionResolver.nativeModel(document)

if (nativeModel?.pcb) {
    const nativePcbMarkup = KicadPcbSvgRenderer.render(nativeModel)
}
```

`nativeModel(document)` returns `null` when native retention was not requested
or the canonical source is not KiCad. `hasNativeModel(document)` provides the
corresponding boolean check. Historical KiCad renderer models pass through the
same resolver unchanged, so a host can use one migration boundary.

Optional renderer CSS is available through:

```js
import 'kicad-toolkit/styles/renderers.css'
```

## Documentation

- [API](docs/api.md)
- [Capabilities](docs/capabilities.md)
- [Migration from 1.0.29](docs/migration.md)
- [1.1.0 release notes](docs/release-notes-v1.1.0.md)
- [1.1.1 release notes](docs/release-notes-v1.1.1.md)
- [1.1.2 release notes](docs/release-notes-v1.1.2.md)
- [1.1.3 release notes](docs/release-notes-v1.1.3.md)
- [1.1.4 release notes](docs/release-notes-v1.1.4.md)
- [1.1.5 release notes](docs/release-notes-v1.1.5.md)
- [1.2.0 release notes](docs/release-notes-v1.2.0.md)
- [1.3.0 release notes](docs/release-notes-v1.3.0.md)
- [1.3.1 release notes](docs/release-notes-v1.3.1.md)
- [Model Format](docs/model-format.md)
- [Native Extension API](docs/native-api.md)
- [Native Capability Inventory](docs/native-capabilities.md)
- [Native Model Format](docs/native-model-format.md)
- [Normalized Model Schema](docs/schemas/kicad_toolkit/normalized_model_a1.schema.json)
- [Testing](docs/testing.md)
- [Scope](spec/library-scope.md)

## Examples

- [RP2040 Minimal Design example](examples/rp2040-minimal-design/) fetches
  Tommy Gilligan's public KiCad board from GitHub and renders it in a browser
  page.

Run the local example server with:

```bash
npm start
```

## Test

```bash
npm test
npm run check:features -- --strict
npm run benchmark
npm run check:format
```

The test suite uses repo-owned fake KiCad fixtures only. Do not add native
customer, vendor, or source project files to this repository.

## License

This project is available under two licensing options.

### 1. Open-source software license

GNU General Public License v3.0 or later (`GPL-3.0-or-later`).

You may use, modify, and distribute this project under the GPL. If you
distribute modified versions or larger works based on this project, they must
comply with the GPL, including source-code availability requirements.

### 2. Commercial/proprietary license

For use in closed-source, proprietary, or otherwise GPL-incompatible products,
a separate paid commercial license is required.

Commercial licensing contact: [https://github.com/SunboX](https://github.com/SunboX)

### Documentation and notices

Documentation and non-code text are licensed under Creative Commons
Attribution-ShareAlike 4.0 (`CC-BY-SA-4.0`) unless otherwise marked.

Copyright (C) 2026 André Fiedler.

Copyright, license, attribution, and source-origin notices must be preserved as
required by the GPL, CC-BY-SA-4.0, and the notice files in this repository.
See [LICENSE](LICENSE), [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md), and
[NOTICE.md](NOTICE.md).
