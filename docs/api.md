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
- `kicad-toolkit/node`
- `kicad-toolkit/renderers`
- `kicad-toolkit/scene3d`
- `kicad-toolkit/workers/kicad-parser.worker.mjs`
- `kicad-toolkit/styles/kicad-renderers.css`

## Parser

```js
import { KicadParser } from 'kicad-toolkit/parser'

const circuitJson = KicadParser.parseArrayBuffer(fileName, arrayBuffer)
```

`fileName` is used to infer schematic, PCB, library, project-sidecar, and
legacy helper parsing from the extension or KiCad table basename. The parser
accepts native `.kicad_sch`, `.kicad_pcb`, `.kicad_mod`, `.kicad_sym`,
`.kicad_jobset`, `.kicad_dru`, `.kicad_wks`, `.net`, `.cmp`, legacy `.lib`,
`.dcm`, `.mod`, plus `fp-lib-table` and `sym-lib-table` bytes as an
`ArrayBuffer`. It returns a Circuit JSON element array with non-serialized
renderer-compatibility fields such as `sourceFormat`, `kind`, `fileType`,
`schematic`, `pcb`, `pcbLibrary`, `schematicLibrary`, `summary`,
`diagnostics`, and `bom` so existing renderers can consume parser output
directly during the migration. Sidecar-only files emit project metadata
elements plus their normalized compatibility roots.

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

Standalone library parsing reads KiCad `.kicad_mod` footprint roots and
`.kicad_sym` `kicad_symbol_lib` roots. Footprint libraries expose recovered
pads, footprint graphics, text, 3D model references, and `pcbLibrary`
metadata. Symbol libraries expose recovered symbol properties, pins, nested
unit/body symbols, graphics, and `schematicLibrary` metadata.

Library table and manifest parsing reads `fp-lib-table`, `sym-lib-table`,
`.pretty` footprint folders, packed `.kicad_sym` files, unpacked
`.kicad_symdir` folders, and `.kicad_blocks` design block folders.
`KicadLibraryIndexBuilder.build(entries)` returns a searchable manifest with
library rows, resolved local items, table metadata, and design block entries.
`KicadLibrarySearchIndex` searches footprint, symbol, design block, and mixed
index items with exact, prefix, keyword, and lightweight fuzzy matching.
`KicadLibraryRenderManifestBuilder` builds deterministic render/export
manifests for footprint libraries, symbol libraries, design block libraries,
and mixed library indexes.

Auxiliary KiCad parser helpers expose `.kicad_jobset` output jobs,
`.kicad_dru` custom rules, `.kicad_wks` worksheets, exported `.net` netlists,
`.cmp` footprint associations, and lightweight legacy `.lib`, `.dcm`, and
`.mod` inspection metadata, including recovered symbol pins, DRAW graphics,
and legacy pin style/visibility flags.
`KicadJobsetDigestBuilder` composes parsed jobsets into job, destination, and
jobs-by-destination lookup rows. `KicadEmbeddedAssetInventoryBuilder` builds a
read-only inventory of embedded schematic files, schematic images, worksheet
bitmaps, PCB 3D model references, and companion project assets.

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

`CircuitJsonConformanceChecker.check(circuitJson)` returns a read-only report
for internal Circuit JSON references, including duplicate element ids, missing
source nets, source ports, source traces, and PCB route endpoint ports.

`CircuitJsonKicadProjectExporter.export(circuitJson, options)` emits
archive-ready KiCad project entries from a Circuit JSON element array,
including project, schematic, board, symbol library, footprint library,
library-table, and optional project-local 3D model files.
CAD component rows attach 3D model nodes only to their owning footprint when
the model source matches a supplied model file. Offsets, rotations, and model
scale are preserved relative to the footprint origin, with board thickness and
component side accounted for when CAD position data is available. PCB artwork
rows owned by a component, such as silkscreen paths/text, fabrication notes,
and courtyard outlines, are emitted as footprint primitives. Board-owned
silkscreen, drawing-note, and fabrication artwork paths, circles, and
rectangles are emitted as board graphics. Board outlines can come from
`pcb_board.outline`, and board cutouts can be emitted as circle, rect, polygon,
or path geometry on `Edge.Cuts`. Copper pour and ground-plane rows emit KiCad
zone outlines plus prefilled polygons, including inner rings from B-Rep-style
shapes, while `pcb_keepout` rows emit KiCad keepout zones with track, via, pad,
copper-pour, and footprint restrictions. Routed traces preserve via and
through-pad layer transitions without duplicating colocated vias, and pad net
names can resolve through PCB ports, source ports, and source-net connectivity
keys. Footprint pad coordinates are converted through the owning component
rotation so rotated footprints keep pad and artwork geometry aligned.
Project exports derive `.kicad_pro` net classes from board defaults plus
generic `source_net` rule fields such as trace width, clearance, and via
dimensions. Source component supplier part numbers are emitted as default
footprint properties unless explicit KiCad metadata overrides them.
Custom schematic symbol rows, including rows referenced through
component-linked graphics, can provide symbol names, graphic primitives, filled
paths, arcs, display pin labels, and port-facing direction for generated KiCad
symbol libraries. Ports can also provide `sch_stem_length`, `schStemLength`, or
`stem_length` to add symbol-local stem graphics from the pin anchor toward the
symbol body. Component-scoped schematic artwork overlays generated symbol bodies
without replacing generated pins. Standalone schematic page graphics and
`schematic_section` rows are emitted as non-electrical graphical items, while
wire rows and `schematic_trace.edges` remain electrical wires with exported trace
junctions. Schematic trace endpoints connected through source traces are snapped
to the exported KiCad pin anchors when they are close enough to avoid off-grid
raw coordinates disconnecting wires from generated or custom symbols. Exported
schematics include deterministic `symbol_instances` paths that point back to the
placed symbol UUIDs and preserve reference, unit, value, and footprint
information for round trips.
KiCad-specific metadata on source, PCB, and label rows can override generated
symbol and footprint names, pass properties, symbol placement flags, pin
name/number display, embedded-font flags, and footprint attributes through,
attach explicit model nodes, emit local, global, or hierarchical labels with
explicit rotation, place power-symbol labels, and add symbol search metadata
such as keywords and footprint filters. The
snake-case and camel-case metadata names are both accepted, including
`kicad_symbol`, `kicadSymbol`, `kicad_symbol_metadata`,
`kicadSymbolMetadata`, `kicad_footprint`, `kicadFootprint`,
`kicad_footprint_metadata`, and `kicadFootprintMetadata`. The
`useGenericConnectorSymbols: true` option maps simple pin-header and connector
source components with no custom symbol metadata to
`Connector_Generic:Conn_01xNN` schematic library IDs while keeping local
generated symbols as the default. The
`modelPathMode: 'library-shapes'` option packages model files under
`3dmodels/<library>.3dshapes` and updates footprint model references. Anonymous
board-owned pads and holes use geometry-derived standalone footprint names based
on pad type, shape, dimensions, drill, and rotation while explicit ids and names
remain stable. `modelSourceRules` can route matching model sources into alternate
archive directories with string, regular-expression, or predicate matchers; a
rule may also provide `modelPathPrefix` for the footprint reference path.
`modelFiles` may carry `outputPath` or `modelPath` directly. Export manifests
include `modelDirectories` alongside the legacy `modelDirectory` field.

`CircuitJsonKicadLibraryExporter.export(circuitJson, options)` emits the
library subset of the same conversion: symbol library, footprint library,
library tables, optional model files, and a library export manifest. Use it
when an integration wants reusable KiCad libraries without a generated
schematic, board, or project file. Library exports can classify metadata-marked
builtin items, omit them with `includeBuiltins: false`, deduplicate repeated
items with `dedupeLibraryItems: true`, and rewrite library-table URIs through
`libraryTableRoot` or a `packageId`-derived third-party root. With
`packageManagerLayout: true`, library exports use split `symbols/`,
`footprints/`, and `3dmodels/` directories and include a package `metadata.json`
entry populated from `packageId`, `packageName`, `packageVersion`, and
`packageDescription`.

Project exports can opt into schematic coordinate normalization with
`schematicScaleFactor`. The scale applies to schematic symbol placements,
electrical wires, labels, page graphics, junctions, and symbol-local generated
or custom geometry. Defaults remain passthrough with a factor of `1`.
`schematicCenterOnPage: true` additionally translates scaled schematic content
to the center of the selected KiCad paper size. Paper selection uses scaled
content bounds, while library-only exports can use `schematicScaleFactor` to
scale reusable symbol geometry without page centering.

`KicadPcmRepositoryIndexBuilder.build({ baseUrl, packages })` composes
`repository.json` and `packages.json` entries for KiCad package feeds from
installable package ZIP bytes. It adds repository-side download URLs, archive
SHA-256 values, download sizes, and install sizes while leaving package archive
metadata free of repository download fields. `previewResponse(result, path)`
returns a small response object for local tests or preview servers.
`KicadPcmPackageQaReportBuilder.build({ entries, strictPackage: true })`
validates installable package entries before publishing, parses packaged symbol
and footprint libraries, reports missing root metadata, unwanted library tables,
parse failures, and footprint model references that are not backed by packaged
`3dmodels/` entries.

`KicadSemanticDiffReportBuilder.build({ leftEntries, rightEntries })` compares
two KiCad source entry sets after normalizing volatile S-expression metadata and
project JSON fields. Use
`KicadSemanticDiffReportBuilder.compareText({ path, leftText, rightText })` for
single-file comparisons.

`CircuitJsonKicadModExporter.export(circuitJson, options)` emits one
standalone KiCad `.kicad_mod` entry from the same Circuit JSON footprint rows
used by project and library exports. Select a footprint with `footprintName`,
`sourceComponentId`, `pcbComponentId`, or `index`; otherwise the first footprint
row is used. The result includes `entry`, `diagnostics`, and a small manifest.
`exportText(circuitJson, options)` returns the serialized footprint text for
hosts that do not need an archive entry wrapper.

`CircuitJsonKicadProjectModelResolver.resolve(options)` loads remote or local
3D model source paths into `modelFiles` entries accepted by the project and
library exporters. The resolver is local-first: it performs no network or file
I/O unless the host provides `fetch` or `readFile` callbacks, and callers can
choose whether load failures throw or become diagnostics. Resolved model rows
include `outputPath`, and the result includes `loadDiagnostics` plus a summary
of loaded and failed source paths. `modelSourceRules` use the same generic
matching contract as the exporters, allowing a resolver result to be passed
directly into project or library export while preserving routed output paths.

`KicadCliVisualSnapshotHarness.render(options)` is exported from
`kicad-toolkit/node` as an optional host-gated KiCad CLI snapshot helper. It is
disabled unless `enabled: true` is supplied and only runs commands through an
injected `execFile` callback, so default tests and browser consumers do not
load or invoke external tools. Hosts can pass `assertNonBlank: true` plus
`readFile` to verify generated visual artifacts are present and non-empty after
the CLI commands complete.

`KicadPcbParser.parse(source, options)` accepts KiCad `.kicad_pcb` source text
and returns the lower-level board model that is wrapped by
`KicadParser.parseArrayBuffer()`. `options.fileName` is copied into the model
for host metadata and accessible renderer labels.

`KicadProjectMetadataParser.parse(source, options)` accepts KiCad `.kicad_pro`
JSON text and returns a normalized project metadata root with `textVariables`,
`netSettings.classes`, `board.designSettings.rules`, boards, sheets, and
top-level sheet metadata.

`KicadFootprintLibraryParser.parse(source, options)` accepts standalone
`.kicad_mod` source text and returns a normalized `footprint-library` root.
`KicadSymbolLibraryParser.parse(source, options)` accepts standalone
`.kicad_sym` source text and returns a normalized `symbol-library` root.
`KicadLibraryTableParser.parse(source, options)` accepts `fp-lib-table` or
`sym-lib-table` source text. `KicadLibraryIndexBuilder`,
`KicadLibrarySearchIndex`, and `KicadLibraryRenderManifestBuilder` provide
project-library manifests, search, and deterministic render/export manifests.
`KicadJobsetParser`, `KicadJobsetDigestBuilder`, `KicadDesignRulesParser`,
`KicadWorksheetParser`, `KicadNetlistParser`,
`KicadFootprintAssociationParser`, and `KicadLegacyLibraryParser` parse their
corresponding sidecar or legacy source text or compose sidecar digests.

`KicadProjectLoader.loadFiles(files)` accepts browser `FileList` or `File[]`
values. `KicadProjectLoader.loadEntries(entries)` accepts named byte entries in
the shape `{ name, bytes }`. Both methods support direct `.kicad_pcb` files and
ZIP archives containing `.kicad_pro`, `.kicad_sch`, `.kicad_pcb`, and companion
3D asset files. They also build a passive `libraries` manifest from local
library tables, `.pretty` folders, `.kicad_sym` files, `.kicad_symdir` folders,
and `.kicad_blocks` folders when those entries are present. Direct board loads
return the raw board, Circuit JSON documents, renderer compatibility documents,
project summary, library manifest, assets, diagnostics, source file name, and
source text. Full project loads return
Circuit JSON documents, renderer compatibility documents, a project summary,
library manifest, companion assets, and diagnostics. Project summaries include
`rootSchematic`, ordered `pages` records for schematic hierarchy pages and PCB
documents, plus library and local library item counts.

`ProjectDesignBundleBuilder.build({ projectModel, documentModels })` composes
loaded KiCad project, schematic, and PCB models into one normalized
`KicadProjectDesignBundle` with sheets, components, nets, BOM, PnP rows,
indexes, and optional `effectiveVariant`. `ProjectVariantViewBuilder.build()`
applies KiCad DNP flags and project variant DNP/parameter overrides.
`ProjectNetlistExporter.buildNetlistJson()` and `buildWirelist()` emit
deterministic KiCad project netlist exports.
`KicadPcbPickPlacePositionResolver.buildModel()` exposes KiCad
footprint-origin and pad-anchor-center PnP coordinate views.
`KicadPcbComponentParticipationPolicy.resolve()` normalizes KiCad footprint
attributes such as `smd`, `through_hole`, `virtual`, `dnp`,
`exclude_from_bom`, and `exclude_from_pos_files` into BOM, netlist, and PnP
participation flags. Parsed PCB documents attach PnP data at `pnp` and
`pcb.pickPlace`.

`KicadProjectDocumentGraphBuilder.build(projectModel, options)` indexes parsed
project pages, standalone parsed documents, local libraries, design blocks,
jobsets, generated outputs, companion assets, and optional missing-path checks.
`KicadSchematicHierarchyGraphBuilder.build(projectModel, options)` indexes
schematic root pages and hierarchical sheet links.
`KicadCiArtifactBundleBuilder.build(options)` composes deterministic parser,
renderer, netlist, document graph, asset, readiness, schematic QA, and contract
gate artifacts for CI-style workflows without writing files or invoking KiCad.
Use `KicadContractGateReportBuilder.build(options)` for the same pass/fail gate
report outside the bundle. Use
`KicadSvgModelCrossLinkValidator.validate(documentModel, svgMarkup)` or
`validateSet(documentModel, svgMarkups)` to compare semantic SVG element keys
and references with the parsed schematic or PCB model.
`KicadParserCompatibilityFuzzer.run()` runs deterministic synthetic KiCad
parser smoke cases and returns a read-only compatibility report.
`KicadPcbRouteAnalysisBuilder.build()`, `KicadPcbStatisticsBuilder.build()`,
`KicadPcbLayerStackReadModelBuilder.build()`,
`KicadPcbLayerUsageReportBuilder.build()`,
`KicadPcbFidelityDiagnosticsBuilder.build()`,
`KicadPcb3dModelReadinessReportBuilder.build()`,
`KicadPcbGeometryReadinessReportBuilder.build()`,
`KicadPcbDimensionReadModelBuilder.build()`,
`KicadPcbRegionSemanticsBuilder.build()`, and
`KicadPcbOwnershipGraphBuilder.build()` expose deterministic PCB route,
board-statistics, stackup, layer-usage, fidelity, model-readiness,
geometry-readiness, dimension, region/keepout, and primitive-ownership read
models. Route-analysis rows include per-net layer participation, track/arc
lengths, connected route groups, and differential-pair summaries when supplied
by callers. Fidelity diagnostics also surface missing named font assets and
suspicious text payloads, geometry readiness reports footprint courtyard gaps,
and model-readiness rows include footprint search keys, pad-1 orientation
hints, and ranked candidate model assets.
`KicadSchematicOwnershipGraphBuilder.build()` exposes schematic component,
pin, text, sheet-entry, directive, rule-area, and net ownership rows.
`KicadPcbReviewMetadataBuilder.build()` adapts route-analysis rows into
review groups, route-highlight profiles, polygon realizations, and drill
overlays, `KicadPcbPlacedFootprintManifestBuilder.build()` emits
`.kicad_mod`-style extraction descriptors for placed footprints, and
`KicadImagePayloadManifestBuilder.build()` emits byte sizes and FNV-1a
checksums for schematic images, worksheet bitmaps, PCB images, and embedded
schematic files. Parsed PCB documents attach layer stack, layer usage, fidelity
diagnostics, geometry readiness, 3D model readiness, dimensions, region
semantics, route analysis, review metadata, and footprint extraction manifests
under `pcb.layerStack`, `pcb.layerUsage`, `pcb.fidelityDiagnostics`,
`pcb.geometryReadiness`, `pcb.modelReadiness`, `pcb.dimensions`,
`pcb.regionSemantics`, `pcb.routeAnalysis`, `pcb.reviewMetadata`, and
`pcb.footprintExtractionManifest`.
`KicadFootprintLibraryParityReportBuilder.build()` reports advanced
standalone footprint-library pad, graphic, and model fields, and standalone
`.kicad_mod` parses attach that report at `pcbLibrary.parityReport`.
`KicadProjectBomPnpReconciliationBuilder.build()` compares schematic BOM,
PCB BOM, PnP, DNP, exclude-from-BOM, and exclude-from-position-file rows.
`KicadLibraryQaReportBuilder.build()` reports duplicate library items,
symbol-library merge-plan conflicts, unresolved footprint references, missing
model assets, and symbol unit mismatches.
`KicadPcmPackageQaReportBuilder.build()` reports publish-blocking package
archive issues, including missing metadata, strict-layout library table files,
unparseable library entries, repository-only metadata fields, and unresolved
packaged model references.
`KicadSchematicQaReportBuilder.build()` reports unresolved
schematic text variables, title-block gaps, and document style summaries.
`KicadSchematicGeometryReadinessReportBuilder.build()` reports
renderer-sensitive schematic geometry, text frames, pin styles, authored
graphic styles, symbol-owned pins or fields outside parsed body bounds, and
unknown graphics. Parsed schematic documents attach this report at
`schematic.geometryReadiness`.
`KicadHostCapabilityDiagnosticsBuilder.build()` mirrors the host capability
diagnostic contract for KiCad render hosts.

Specialized parser helpers are exported for lower-level integrations, including
`CircuitJsonKicadLibraryExporter`, `CircuitJsonKicadModExporter`,
`CircuitJsonKicadProjectExporter`, `CircuitJsonKicadProjectModelResolver`,
`Geometry`, `KicadArcGeometry`,
`KicadCiArtifactBundleBuilder`, `KicadContractGateReportBuilder`,
`KicadLayerResolver`, `KicadNetResolver`,
`KicadDesignBlockLibraryParser`, `KicadDesignRulesParser`,
`KicadEmbeddedAssetInventoryBuilder`,
`KicadFootprintAssociationParser`, `KicadFootprintLibraryParser`,
`KicadFootprintLibraryParityReportBuilder`,
`KicadHostCapabilityDiagnosticsBuilder`,
`KicadImagePayloadManifestBuilder`,
`KicadJobsetDigestBuilder`, `KicadJobsetParser`,
`KicadLegacyLibraryParser`, `KicadLibraryIndexBuilder`,
`KicadLibraryRenderManifestBuilder`, `KicadLibrarySearchIndex`,
`KicadLibraryQaReportBuilder`, `KicadLibraryTableParser`, `KicadNetlistParser`,
`KicadParserCompatibilityFuzzer`, `KicadPcbDrawingParser`,
`KicadPcmPackageQaReportBuilder`, `KicadPcmRepositoryIndexBuilder`,
`KicadPcbComponentParticipationPolicy`,
`KicadPcb3dModelReadinessReportBuilder`,
`KicadPcbDimensionReadModelBuilder`, `KicadPcbFidelityDiagnosticsBuilder`,
`KicadPcbGeometryReadinessReportBuilder`, `KicadPcbLayerMetadata`,
`KicadPcbLayerStackReadModelBuilder`, `KicadPcbOwnershipGraphBuilder`,
`KicadPcbPadParser`, `KicadPcbPickPlacePositionResolver`,
`KicadPcbPlacedFootprintManifestBuilder`,
`KicadPcbRegionSemanticsBuilder`,
`KicadPcbReviewMetadataBuilder`,
`KicadPcbRigidFlexTopologyBuilder`, `KicadPcbRouteAnalysisBuilder`,
`KicadPcbRuleReadModelBuilder`, `KicadPcbStatisticsBuilder`,
`KicadProjectBomPnpReconciliationBuilder`,
`KicadProjectDocumentGraphBuilder`, `KicadProjectMetadataParser`,
`KicadProjectOutputDigestBuilder`,
`KicadFeatureParity`, `KicadReadinessReport`,
`KicadSchematicConnectivityQaBuilder`, `KicadSchematicGraphicParser`,
`KicadSchematicGeometryReadinessReportBuilder`,
`KicadSchematicHierarchyGraphBuilder`,
`KicadSchematicOwnershipGraphBuilder`, `KicadSchematicQaReportBuilder`,
`KicadSchematicSymbolParser`,
`KicadSemanticDiffReportBuilder`, `KicadSourceCoverageReportBuilder`,
`KicadSvgModelCrossLinkValidator`,
`KicadSymbolLibraryParser`,
`KicadToolkitCapabilities`,
`KicadWorksheetParser`, `ProjectDesignBundleBuilder`,
`ProjectNetlistExporter`, `ProjectVariantViewBuilder`, and
`SchematicProjectParameterResolver`, `SExpressionSchema`, and
`SExpressionTree`. The layer, net, drawing, pad, schematic, report,
capability, library, sidecar, and S-expression helpers expose the same
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

`KicadSchematicConnectivityQaBuilder.build(schematicOrDocument)` returns
schematic-local connectivity findings for implicit net names, dangling labels,
orphan sheet entries, unconnected visible pins, and ambiguous junctions. It
uses parsed schematic model data only and does not invoke KiCad.
`KicadSchematicQaReportBuilder.build(input)` returns document-level schematic
QA for unresolved `${Variable}` references, title-block gaps, font families,
and authored line widths.
`KicadSchematicGeometryReadinessReportBuilder.build(input)` returns
renderer-readiness findings for schematic Beziers, long or degenerate arcs,
rounded rectangles, fixed text frames, pin styles, authored graphic styles, and
symbol-owned pins or fields outside parsed body bounds, plus preserved unknown
graphics.
`KicadProjectBomPnpReconciliationBuilder.build(options)` returns project-level
BOM/PnP drift findings, and `KicadLibraryQaReportBuilder.build(options)`
returns library collection QA and read-only merge-plan diagnostics for symbol
and footprint library sets.

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
    BomTableRenderer,
    KicadSvgUtils,
    PcbArcUtils,
    PcbEdgeFacingGlyphNormalizer,
    PcbFootprintPrimitiveSelector,
    PcbSvgSemanticMetadata,
    SchematicColorResolver,
    SchematicContentLayout,
    SchematicOwnerPinLabelLayout,
    SchematicProjectParameterResolver,
    SchematicRenderOpsSidecarBuilder,
    SchematicSvgUtils,
    SchematicSvgSemanticMetadata,
    SchematicSvgTextMetrics,
    SchematicTypography
} from 'kicad-toolkit/renderers'
```

- `SchematicSvgRenderer.render(documentModel)` returns schematic SVG markup.
- `PcbSvgRenderer.render(documentModel, options)` returns PCB SVG markup.
  Passing `null` renders the empty drop prompt SVG.
- `PcbSvgRenderer.renderLayerSvgs(documentModel)` returns deterministic
  per-layer KiCad SVG exports keyed by declared display layer.
- `PcbSideResolvedRenderModel.resolve(documentModel, { side })` and
  `preparePcbSideResolvedRenderModel(documentModel, { side })` return a
  side-specific PCB render model for top-oriented renderers. Use
  `side: 'back'` to project bottom components, documentation layers, copper
  primitives, vias, pad geometry, and KiCad stroke text into the top-facing
  render surface.
- `BomTableRenderer.render(rows)` returns grouped BOM table markup.
- `KicadStrokeFont` exposes the stroke-font metrics and path construction used
  by the SVG renderer.
- `KicadSvgUtils` exposes deterministic renderer helper methods for compact
  SVG number formatting, escaping, attribute rendering, point projection, and
  path construction.
- `PcbArcUtils`, `PcbEdgeFacingGlyphNormalizer`,
  `PcbFootprintPrimitiveSelector`, `SchematicColorResolver`,
  `SchematicContentLayout`, `SchematicOwnerPinLabelLayout`,
  `SchematicSvgUtils`, and `SchematicTypography` expose renderer facade
  helpers compatible with the Altium Toolkit helper surface while using KiCad
  geometry, layer, color, layout, and stroke-text rules.
- `PcbSvgSemanticMetadata` and `SchematicSvgSemanticMetadata` expose the
  semantic metadata builders used by the PCB and schematic SVG renderers.
- `SchematicRenderOpsSidecarBuilder.build(schematic)` emits deterministic
  `kicad-toolkit.schematic.render-ops.a1` operation rows for schematic lines,
  pins, sheet entries, images, frame objects, and KiCad stroke text.
  `SchematicSvgRenderer` embeds the same sidecar as
  `<metadata id="schematic-render-ops-metadata">`.
- `SchematicProjectParameterResolver.resolveSchematic(schematic, parameters)`
  resolves KiCad `${Variable}` text without mutating the source schematic.
- `SchematicSvgTextMetrics` exposes KiCad stroke-text placement metrics used by
  the schematic renderer.
- Schematic SVG rendering includes root text boxes and table cells using the
  same KiCad stroke-font path renderer as labels and fields. Hierarchical
  sheet entries and schematic image payloads are rendered deterministically,
  with placeholders for missing image bytes or dimensions. Authored schematic
  stroke type, stroke color, and fill color are honored when present, with
  existing theme variables retained as fallbacks.

Renderer output is deterministic string markup. The library does not attach DOM
events or mutate a host document. PCB and schematic SVG output includes
semantic `data-*` attributes plus metadata sidecars for layers, nets,
components, pins, pads, drills, schematic render operations, and rendered view
context.

## 3D Scene Data

```js
import {
    PcbScene3dBuilder,
    PcbScene3dModelRegistry,
    PcbScene3dPackages,
    PcbScene3dScenePreparator,
    PcbScene3dSummaryRenderer,
    PcbScene3dTextBoxLayoutResolver
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
- `PcbScene3dTextBoxLayoutResolver.resolve(text)` resolves KiCad
  `gr_text_box` and `fp_text_box` geometry, margins, border, and alignment
  metadata for scene consumers. Scene text rows include `textBoxLayout` when
  parsed text-box metadata is available.

The library intentionally does not create Three.js objects, canvases, controls,
or event listeners.
