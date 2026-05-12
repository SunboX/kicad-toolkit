<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# KiCad Toolkit

KiCad Toolkit is an ESM JavaScript library for parsing native KiCad schematic
and PCB documents and rendering deterministic, non-interactive outputs from the
recovered model.

The package was extracted from [PCB Styler](https://pcb-styler.app/), where it
is used for browser-based KiCad board/project loading and deterministic render
output, and it is also used in [ECAD Forge](https://ecadforge.app/). Its parser
behavior, normalized model shape, project ZIP loading, and renderer output can
be reused by other browser or Node-based tools.

## Features

- Parse standalone native `.kicad_sch` and `.kicad_pcb` files from
  `ArrayBuffer`
- Load browser `File` objects or named byte entries from KiCad board files and
  project ZIP archives
- Recover schematic symbols, sheet symbols, labels, nets, graphical items,
  embedded schematic metadata, board outlines, footprints, pads, copper
  segments, vias, zones, drawings, text, layer side metadata, and board bounds
- Preserve raw KiCad board detail through the wrapped `pcb.kicadBoard` model so
  lower-level KiCad parser output remains inspectable
- Emit versioned normalized model roots with a machine-readable JSON Schema
  contract
- Render schematic SVG, PCB SVG, and grouped BOM HTML
- Build non-interactive PCB 3D scene-description data for host applications
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
    KicadParser,
    SchematicSvgRenderer,
    PcbSvgRenderer,
    preparePcbSideResolvedRenderModel,
    BomTableRenderer,
    PcbScene3dBuilder
} from 'kicad-toolkit'

const documentModel = KicadParser.parseArrayBuffer(file.name, arrayBuffer)
const backRenderModel = preparePcbSideResolvedRenderModel(documentModel, {
    side: 'back'
})

const schematicMarkup = SchematicSvgRenderer.render(documentModel)
const pcbMarkup = PcbSvgRenderer.render(backRenderModel)
const bomMarkup = BomTableRenderer.render(documentModel.bom || [])
const sceneDescription = PcbScene3dBuilder.build(documentModel)
```

Optional renderer CSS is available through:

```js
import 'kicad-toolkit/styles/kicad-renderers.css'
```

## Documentation

- [API](docs/api.md)
- [Model Format](docs/model-format.md)
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
