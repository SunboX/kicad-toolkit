<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Capabilities

KiCad Toolkit exposes a read-only capability inventory and normalized report
helpers so host applications can describe parser, rendering, and readiness
support without probing individual classes.
The inventory also covers standalone footprint and symbol library parsing,
library table and manifest parsing, library search and render manifests,
project metadata parsing, design block indexing, jobset digesting,
project output digesting, asset inventory, project document graph indexing,
jobset/custom-rule/worksheet/netlist/association sidecar parsing, legacy
library inspection, design bundle composition, semantic SVG metadata, semantic
SVG/model cross-link validation, renderer helper APIs, schematic render-op
sidecars, per-layer SVG exports, split helper schema publication, PCB route
analysis, PCB statistics, PCB
layer-stack reports, PCB layer-usage reports, PCB fidelity diagnostics, PCB 3D
model readiness reports, PCB geometry readiness reports, PCB dimension reports,
PCB region/keepout reports, PCB rule read models, PCB rigid-flex topology
status, source coverage reports, PCB ownership graph indexing, schematic
ownership graph indexing, schematic hierarchy graph indexing, KiCad PnP
coordinate views, CI artifact bundle composition, deterministic parser
compatibility smoke cases, schematic connectivity QA, schematic document QA,
library QA, library merge-plan diagnostics, BOM/PnP reconciliation, and
deterministic project netlist/wirelist export.

## Capability Inventory

`KicadToolkitCapabilities.inventory(options)` returns a filterable feature
matrix. The inventory is data only; it does not parse files, invoke external
tools, mutate input, create backups, or write output files.

```js
import { KicadToolkitCapabilities } from 'kicad-toolkit/parser'

const reporting = KicadToolkitCapabilities.inventory({
    category: 'reporting'
})
```

Each capability includes:

| Field             | Meaning                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `id`              | Stable machine-readable capability id                            |
| `label`           | Human-readable feature name                                      |
| `category`        | Feature area such as `parser`, `rendering`, or `reporting`       |
| `safety`          | Current mutation class; all built-in records are `read_only`     |
| `requires`        | Runtime dependency labels, or an empty list when none are needed |
| `outputs`         | Main output shapes produced by the capability                    |
| `supportsBrowser` | Whether the capability is intended for browser runtimes          |
| `supportsNode`    | Whether the capability is intended for Node.js runtimes          |
| `supportsDryRun`  | Whether the capability has a meaningful write dry-run mode       |
| `createsBackup`   | Whether the capability creates backup files                      |
| `mutatesInput`    | Whether the capability mutates caller-provided data              |
| `summary`         | Short behavior summary                                           |

The response also contains aggregate counts:

- `categories`: category labels, descriptions, and matching counts
- `safetyCounts`: capability counts by safety class
- `dependencyCounts`: dependency label counts, with `none` for dependency-free
  capabilities
- `dryRunCounts`: counts for capabilities with meaningful dry-run behavior
- `backupCounts`: counts for capabilities that create backups

All current package capabilities are `read_only`. `supportsDryRun` and
`createsBackup` are false because the library does not perform write operations.

## Feature Parity Inventory

`KicadFeatureParity.inventory(options)` returns a read-only parity contract for
Altium Toolkit user-facing capabilities that have KiCad equivalents or
documented source-format exemptions. The helper is data only; it does not parse
files, render documents, mutate input, create backups, or invoke external tools.

```js
import { KicadFeatureParity } from 'kicad-toolkit/parser'

const parity = KicadFeatureParity.inventory()
const pcbRendering = KicadFeatureParity.inventory({
    category: 'pcb_rendering'
})
```

Each implemented feature includes:

| Field              | Meaning                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| `id`               | Stable machine-readable parity feature id                                     |
| `label`            | Human-readable feature name                                                   |
| `category`         | Parity area such as `parser_roots`, `pcb_rendering`, or `scene3d`             |
| `status`           | Current implementation status; built-in features are `implemented`            |
| `kicadNative`      | Whether the capability is KiCad-native rather than an adapted shared contract |
| `altiumCapability` | Altium Toolkit user-facing capability being matched                           |
| `kicadCapability`  | KiCad Toolkit capability that provides the equivalent behavior                |
| `entrypoints`      | Public package entrypoints that expose the capability                         |
| `docs`             | Documentation files that describe the capability                              |
| `tests`            | Test files that cover the capability                                          |
| `summary`          | Short behavior summary                                                        |

The response includes aggregate `categories`, `statusCounts`, `nativeCounts`,
and `featureCoverage` fields. Unknown filters are treated as empty result sets,
so host applications can probe optional categories without handling exceptions.

### Source-Format Exemptions

Some Altium Toolkit capabilities are intentionally not copied because they are
specific to Altium file storage rather than shared EDA-library behavior. The
`exemptions` list records these cases with the Altium capability, the reason it
does not apply to native KiCad files, and the closest KiCad equivalent.

Current exemptions cover OLE compound documents, Altium binary primitive
streams, `.PcbLib` stream containers, `.PrjPcb` INI parsing, Altium Draftsman
digests, Altium raw record registries, and embedded Altium binary payload
extraction. KiCad equivalents are S-expression parsing, `.kicad_mod` footprint
parsing, `.kicad_sym` symbol parsing, `fp-lib-table` and `sym-lib-table`
parsing, library manifest building, project ZIP loading, `.kicad_wks`
worksheet parsing, `.kicad_jobset` parsing, generated-output metadata,
document graph indexing, raw KiCad AST/model preservation, companion asset
metadata, and KiCad stroke-font rendering.

Renderer-side helper parity is provided through `kicad-toolkit/renderers`.
`KicadSvgUtils`, `PcbArcUtils`, `PcbEdgeFacingGlyphNormalizer`,
`PcbFootprintPrimitiveSelector`, `PcbSvgSemanticMetadata`,
`SchematicColorResolver`, `SchematicContentLayout`,
`SchematicOwnerPinLabelLayout`, `SchematicSvgUtils`,
`SchematicSvgSemanticMetadata`, `SchematicRenderOpsSidecarBuilder`,
`SchematicProjectParameterResolver`, `SchematicSvgTextMetrics`, and
`SchematicTypography` expose the deterministic utility contracts used by the
built-in renderers without requiring host applications to import internal
files.

## CI And Compatibility Helpers

`KicadProjectDocumentGraphBuilder.build()` creates a read-only graph of parsed
KiCad project documents, project pages, linked libraries, design blocks,
jobsets, generated outputs, assets, and optional missing-path checks.
`KicadProjectOutputDigestBuilder.build()` creates jobset-derived output groups,
document lookup indexes, and expected artifact manifests for project output
planning.
`KicadSchematicHierarchyGraphBuilder.build()` creates a read-only graph of
schematic root pages and hierarchical sheet references.
`KicadCiArtifactBundleBuilder.build()` composes deterministic parser, renderer,
netlist, readiness, QA, asset, document graph, and contract gate artifacts for
CI workflows. `KicadContractGateReportBuilder.build()` exposes the same
normalized-model, netlist, SVG/model-link, and diagnostic gates as a standalone
report.
Both helpers are data only and do not write files.

`KicadPcbRouteAnalysisBuilder.build()`,
`KicadPcbStatisticsBuilder.build()`,
`KicadPcbLayerStackReadModelBuilder.build()`,
`KicadPcbLayerUsageReportBuilder.build()`,
`KicadPcbFidelityDiagnosticsBuilder.build()`,
`KicadPcb3dModelReadinessReportBuilder.build()`,
`KicadPcbGeometryReadinessReportBuilder.build()`,
`KicadPcbDimensionReadModelBuilder.build()`,
`KicadPcbRegionSemanticsBuilder.build()`, and
`KicadPcbOwnershipGraphBuilder.build()` expose deterministic PCB route,
statistics, stackup, layer-usage, fidelity, model-readiness,
geometry-readiness, dimension, region/keepout, and primitive ownership reports
from normalized parser data.
`KicadSchematicGeometryReadinessReportBuilder.build()` exposes the matching
schematic-side renderer-readiness report for Beziers, arcs, rounded
rectangles, fixed text frames, pin styles, authored graphic styles, and unknown
graphics. Schematic SVG output renders text boxes and table cells with
deterministic stroke-font text, hierarchical sheet entries, and schematic
image payloads with placeholders for missing image data. It honors authored
schematic stroke/fill colors and stroke patterns when present.
Route analysis includes per-net layer participation, connected route groups,
track/arc lengths, and caller-supplied differential-pair summaries.
Layer-stack, layer-usage, fidelity, geometry-readiness, model-readiness,
dimension, region, and rigid-flex topology reports are attached to parsed PCB
renderer models at `pcb.layerStack`, `pcb.layerUsage`,
`pcb.fidelityDiagnostics`, `pcb.geometryReadiness`, `pcb.modelReadiness`,
`pcb.dimensions`, `pcb.regionSemantics`, and `pcb.rigidFlexTopology`.
Model-readiness fallbacks include the procedural package family and size that
scene consumers would use for generated component bodies.
`KicadPcbRuleReadModelBuilder.build()` normalizes KiCad custom DRC rules,
project design settings, and net classes into typed rule rows.
`KicadPcbRigidFlexTopologyBuilder.build()` reports KiCad flat-stack and
region-metadata topology status without inventing unsupported Altium-style
branch graphs. `KicadSourceCoverageReportBuilder.build()` reports supported
and preserved-only KiCad S-expression node families for parser consumers.
`KicadPcbReviewMetadataBuilder.build()` builds review groups from route
analysis plus route-highlight profiles, polygon realizations, and drill
overlays. `KicadPcbPlacedFootprintManifestBuilder.build()` emits placed
footprint extraction descriptors, and
`KicadFootprintLibraryParityReportBuilder.build()` reports advanced
standalone footprint-library fields. `KicadImagePayloadManifestBuilder.build()`
checksums image-like payloads from parsed KiCad documents, and
`KicadHostCapabilityDiagnosticsBuilder.build()` reports render-host capability
fallbacks.
`KicadPcbComponentParticipationPolicy.resolve()` normalizes KiCad footprint
attributes into BOM, PnP, and netlist participation flags.
`KicadProjectBomPnpReconciliationBuilder.build()` compares schematic BOM, PCB
BOM, PnP, DNP, exclude-from-BOM, and exclude-from-position-file designators.
`KicadLibraryQaReportBuilder.build()` checks library collections for duplicate
items, symbol-library merge-plan conflicts, unresolved footprint references,
missing model assets, and unit mismatches.
`KicadSchematicQaReportBuilder.build()` reports unresolved
schematic text variables, title-block gaps, font families, and authored line
widths.
`KicadSchematicOwnershipGraphBuilder.build()` indexes schematic components,
pins, texts, sheet entries, directives, rule areas, and nets by component or
hierarchical sheet ownership.

`KicadSvgModelCrossLinkValidator.validate()` compares semantic SVG element keys
and references with parsed schematic or PCB model records.
`KicadParserCompatibilityFuzzer.run()` executes deterministic synthetic KiCad
parser smoke cases for compatibility checks.

## Schematic Connectivity QA

`KicadSchematicConnectivityQaBuilder.build(schematicOrDocument)` creates a
read-only QA report from parsed schematic data. It reports implicit net names,
dangling labels, orphan sheet entries, unconnected visible pins, and authored
junctions that do not participate in any recovered net. The helper is intended
for parser-quality and migration checks; it does not replace KiCad ERC.

## Schematic And Library QA

`KicadSchematicQaReportBuilder.build(input)` creates a document-level
schematic QA report. It summarizes text rows, font families, line widths,
unresolved `${Variable}` references, title-block gaps, and findings. The helper
uses caller-provided `projectParameters` for variable resolution and leaves
source models unchanged.

`KicadSchematicGeometryReadinessReportBuilder.build(input)` creates a
renderer-readiness report for schematic geometry. Parsed schematic renderer
models attach the report at `schematic.geometryReadiness`.

`KicadLibraryQaReportBuilder.build(options)` creates a collection-level library
QA report for parsed KiCad symbol and footprint libraries. It reports duplicate
symbol names, duplicate footprint names, unresolved symbol footprint
references, missing footprint model assets when an available asset list is
provided, skipped symbol unit numbers, and a
`kicad-toolkit.library.merge-plan.a1` sidecar with conflicts, rename
suggestions, embedded assets, font dependencies, and diagnostics.

## BOM/PnP Reconciliation

`KicadProjectBomPnpReconciliationBuilder.build(options)` creates a project
BOM/PnP reconciliation report from a design bundle and parsed documents. It
compares schematic BOM designators, PCB-backed BOM designators, PnP
designators, effective variant BOM designators, DNP rows, exclude-from-BOM
rows, and exclude-from-position-file rows.

## Report Normalization

`KicadReadinessReport` normalizes caller-supplied DRC and ERC report data into
a compact issue shape. The helpers accept JSON strings, objects, or arrays that
contain report issue lists such as `violations`, `warnings`, `errors`,
`exclusions`, `unconnected_items`, `schematic_parity`, or `items`.

```js
import { KicadReadinessReport } from 'kicad-toolkit/parser'

const normalized = KicadReadinessReport.parseDrcReport(reportJson, {
    includeItems: false,
    severity: 'error'
})

const ercSummary = KicadReadinessReport.summarizeErcReport(ercJson)
```

Normalized issues include:

| Field      | Meaning                                                    |
| ---------- | ---------------------------------------------------------- |
| `category` | Source issue-list category                                 |
| `severity` | Normalized lowercase severity                              |
| `rule`     | Rule, type, code, constraint, or category fallback         |
| `message`  | Human-readable description                                 |
| `items`    | Optional source item detail when `includeItems` is enabled |
| `pos`      | Optional source position detail                            |
| `uuid`     | Optional source UUID                                       |
| `excluded` | Optional source exclusion flag                             |
| `details`  | Optional source detail payload                             |

`parseDrcReport()` and `parseErcReport()` return issue lists with totals and
counts by severity, rule, and category. `summarizeDrcReport()` and
`summarizeErcReport()` return the same counts plus a small `examples` array.

Supported options:

| Option         | Meaning                                                    |
| -------------- | ---------------------------------------------------------- |
| `includeItems` | Defaults to true for parse helpers and false for summaries |
| `limit`        | Maximum returned issues for parse helpers                  |
| `exampleLimit` | Maximum examples returned by summary helpers               |
| `severity`     | Case-insensitive exact severity filter                     |
| `rule`         | Case-insensitive exact rule filter                         |
| `category`     | Case-insensitive exact category filter                     |

## Fabrication Readiness

`KicadReadinessReport.fabricationReadiness(input)` summarizes a parsed board
model using recovered library data only. It accepts a lower-level
`pcb.kicadBoard` model, a renderer compatibility document, or a wrapper with
`{ kicadBoard }`.

```js
const readiness = KicadReadinessReport.fabricationReadiness(
    documentModel.pcb.kicadBoard
)
```

The readiness response contains:

| Field           | Meaning                                                                    |
| --------------- | -------------------------------------------------------------------------- |
| `ok`            | True when no blocker findings are present                                  |
| `readiness`     | `ready`, `review`, or `blocked`                                            |
| `score`         | 0-100 score after blocker, warning, and info penalties                     |
| `findingCounts` | Counts by `blocker`, `warning`, and `info`                                 |
| `findings`      | Normalized finding records with `severity`, `kind`, `count`, and `message` |
| `statistics`    | Footprint, pad, net, track, via, zone, and copper-layer counts             |
| `outline`       | Outline item count and unmatched endpoint count                            |
| `connectivity`  | No-net pad and unrouted multi-pad net summaries                            |
| `bounds`        | Parsed board bounds when available                                         |

Readiness findings are intentionally conservative. They flag missing or open
board outlines, insufficient copper layers, missing footprints, unrouted
multi-pad nets, no-net pads, and missing visible 3D model metadata. The helper
does not replace a full electrical, design-rule, or fabrication review.
