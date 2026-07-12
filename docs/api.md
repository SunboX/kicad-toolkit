<!--
SPDX-FileCopyrightText: 2026 André Fiedler
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# API

## Root contract

`kicad-toolkit` exposes the exact same root classes as the other ECAD toolkits:

```js
import {
    BomTableRenderer,
    CircuitJsonDocument,
    CircuitJsonDocumentContext,
    CircuitJsonIndexer,
    CircuitJsonUnits,
    ManufacturingService,
    Parser,
    PcbInteractionIndex,
    PcbScene3dBuilder,
    PcbScene3dPreparator,
    PcbSvgRenderer,
    ProjectLoader,
    QueryService,
    SchematicSvgRenderer,
    SimulationService,
    ToolkitCapabilities,
    ToolkitError
} from 'kicad-toolkit'
```

All source-neutral services are the same implementations exported by
`circuitjson-toolkit` and consume canonical document envelopes or prepared
`CircuitJsonDocumentContext` values directly.

## Parser

```js
import { Parser } from 'kicad-toolkit/parser'

const document = await Parser.parseAsync(
    { fileName: file.name, data: await file.arrayBuffer() },
    { worker: 'auto' }
)
```

The parser subpath also exports the shared `CircuitJsonDocumentContext`,
`DocumentResult`, asset, diagnostic, progress, error, and worker-protocol
classes with the same identities as `circuitjson-toolkit/parser`.
`Parser.parse()`, `parseAsync()`, `tryParse()`, and `supports()` follow the
common contract. Inputs use `{ fileName, data, assets? }`; `data` may be a
string, `ArrayBuffer`, or `Uint8Array`. Successful parsing returns an immutable
`ecad-toolkit.document.v1` envelope with dense CircuitJSON in `document.model`.
The parser applies the shared `CircuitJsonDocument.normalizeModel()` boundary
before validation, so its model is directly consumable by the viewer and the
other common services.

Common options include `worker`, `signal`, `onProgress`, `extensions`,
`preserveRaw`, `decodeAssets`, `retainSource`, `transferInput`, and `reports`.
Unknown extension/report ids fail with `ERR_CAPABILITY_UNAVAILABLE`.
Worker parsing sends only the same public `{ fileName, data, assets? }` input
shape. Full binary assets remain available in the returned document;
`transferInput: false` preserves caller buffers and `transferInput: true`
transfers exact transferable buffers.

The parser supports native `.kicad_sch`, `.kicad_pcb`, `.kicad_mod`,
`.kicad_sym`, `.kicad_jobset`, `.kicad_dru`, `.kicad_wks`, `.net`, `.cmp`,
legacy `.lib`/`.dcm`/`.mod`, `fp-lib-table`, and `sym-lib-table` inputs.

### Retained native model

Canonical CircuitJSON remains the default and is sufficient for shared
rendering, query, BOM, manufacturing, simulation, and 3D services. When a host
needs source-native KiCad schematic, PCB, layer, or interaction fidelity, it
can retain the native renderer model during the same parse and resolve it
through the explicit extension boundary:

```js
import { Parser } from 'kicad-toolkit/parser'
import { KicadExtensionResolver } from 'kicad-toolkit/extensions'

const document = Parser.parse(
    { fileName: 'board.kicad_pcb', data: boardBytes },
    { extensions: ['kicad.native-model'], decodeAssets: 'full' }
)
const nativeModel = KicadExtensionResolver.nativeModel(document)

if (KicadExtensionResolver.hasNativeModel(document)) {
    console.log(nativeModel.pcb)
}
```

`nativeModel(document)` returns the owned `extensions.kicad.native` record only
for an `ecad-toolkit.document.v1` envelope whose owned `source.format` is
exactly `kicad`. It returns `null` for canonical documents that did not request
the extension and for other source formats. Historical renderer models pass
through unchanged only when their owned `sourceFormat` is `kicad` or their
owned schema begins with `urn:kicad-toolkit:` or `kicad-toolkit.`. The resolver
does not invoke accessors or reparse source data.

`ProjectLoader.load()` and `loadAsync()` accept the same
`extensions: ['kicad.native-model']` option and retain the native model on each
returned KiCad document.

## Project loading

```js
import { ProjectLoader } from 'kicad-toolkit/project'

const project = await ProjectLoader.loadAsync([
    { name: 'design.zip', data: zipArrayBuffer }
])
```

`ProjectLoader.load()`, `loadAsync()`, `tryLoad()`, and `supports()` accept
dense `{ name, data, assets? }` entry arrays. A single ZIP blob is expanded
internally; callers do not need an app adapter. Member paths, entry counts,
expanded bytes, per-entry bytes, nesting, and compression ratio are bounded by
the common `archiveLimits` option. Supported entries become canonical document
envelopes; companion files become assets according to `decodeAssets`. ZIP
metadata is preflighted before inflation and every extracted member is checked
against its declared size and CRC32. Async loading snapshots names, exact byte
windows, assets, and options before progress delivery. Candidates parse
independently: successful documents remain in the project, failed candidates
emit deterministic diagnostics, and `statistics.failureCount` counts only
those parse failures.

The worker path accepts the same public entries without sender-only accounting
fields. Asset byte lengths are derived inside the receiving worker, so
`archiveLimits` include assets in `none`, `metadata`, and `full` decode modes.

The project subpath also exports the shared `ArchiveEntryPath`, `ArchiveLimits`,
`ProjectResult`, and `ZipArchiveInspector` identities from
`circuitjson-toolkit/project`.

For PCB projects, the loader resolves `${KIPRJMOD}` references against the
directory of the nearest owning `.kicad_pro` entry and emits exact canonical
asset paths. It falls back to the `.kicad_pcb` directory only when the project
contains no owning project entry. Every visible native footprint model becomes
its own `cad_component` row. Full asset mode keeps the companion bytes
available to ECAD Forge and the shared 3D viewer without an app-specific
resolver.

## Package layout

| Subpath                                   | Purpose                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `kicad-toolkit/parser`                    | Common parser, context, errors, assets, diagnostics, progress, worker protocol |
| `kicad-toolkit/project`                   | Common project loader, archive inspector/limits, project envelope              |
| `kicad-toolkit/renderers`                 | Shared CircuitJSON SVG and BOM renderers                                       |
| `kicad-toolkit/interaction`               | Shared PCB interaction service                                                 |
| `kicad-toolkit/query`                     | Shared document query service                                                  |
| `kicad-toolkit/manufacturing`             | Shared manufacturing exporters                                                 |
| `kicad-toolkit/simulation`                | Shared injected simulation service                                             |
| `kicad-toolkit/scene3d`                   | Shared CircuitJSON scene builder and preparator                                |
| `kicad-toolkit/capabilities`              | Common capability inventory                                                    |
| `kicad-toolkit/extensions`                | Browser-safe native 1.0.29 API and canonical native-model resolver             |
| `kicad-toolkit/extensions/node`           | Native Node-only CLI helper                                                    |
| `kicad-toolkit/extensions/netlist-query`  | Native netlist query helpers                                                   |
| `kicad-toolkit/testing`                   | Shared contract fixtures and runner                                            |
| `kicad-toolkit/workers/parser.worker.mjs` | Common worker endpoint                                                         |
| `kicad-toolkit/styles/renderers.css`      | Common optional renderer CSS                                                   |

The complete native API reference remains in [Native Extension API](native-api.md).
