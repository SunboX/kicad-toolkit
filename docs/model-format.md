<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Model Format

The public parser returns one Circuit JSON element array per parsed native
KiCad document. Circuit JSON is the serialized model contract. The returned
array also carries non-serialized renderer-compatibility fields that preserve
the previous ECAD Forge parser model for renderers and migration code.

## Circuit JSON Fields

Every parser result is an array of elements with a `type` field. The adapter
emits Circuit JSON elements for source project metadata, source components,
ports, nets, schematic symbols, schematic lines, schematic text, PCB boards,
PCB components, PCB pads, PCB traces, and PCB vias where those structures are
available in the source document.

Use `CircuitJsonModelSchema.isModel(result)` to validate that a value is a
Circuit JSON array. `JSON.stringify(result)` serializes only the Circuit JSON
elements; compatibility fields are intentionally omitted from serialized JSON.

## Renderer Compatibility Fields

For compatibility, `KicadParser.parseArrayBuffer()` attaches the previous
renderer model fields directly to the Circuit JSON array. Integrations that need
the object form can call
`KicadParser.parseArrayBufferToRendererModel(fileName, arrayBuffer)` or
`CircuitJsonModelAdapter.toRendererModel(circuitJson)`.

## Common Fields

- `schema`: normalized model schema id, currently
  `urn:kicad-toolkit:normalized-model:a1`
- `sourceFormat`: `kicad`
- `kind`: `schematic`, `pcb`, `footprint-library`, `symbol-library`,
  `library-table`, `library-index`, `project-metadata`, `design-bundle`,
  `jobset`, `jobset-digest`, `design-rules`, `worksheet`, `netlist`,
  `footprint-associations`, `design-block-library`, `legacy-library`, or
  `asset-inventory`
- `fileType`: `kicad_sch`, `kicad_pcb`, `kicad_mod`, `kicad_sym`,
  `fp_lib_table`, `sym_lib_table`, `KicadLibraryIndex`, `kicad_pro`,
  `KicadProjectDesignBundle`, `kicad_jobset`, `KicadJobsetDigest`,
  `kicad_dru`, `kicad_wks`, `net`, `cmp`, `kicad_blocks`, `lib`, `dcm`,
  `mod`, or `KicadAssetInventory`
- `fileName`: original file name passed to the parser
- `summary`: compact document metadata and recovered item counts
- `diagnostics`: parser warnings and recovery notes
- `bom`: grouped component metadata where available

## Schema Contracts

The legacy renderer compatibility contract is published as a JSON Schema at
[`docs/schemas/kicad_toolkit/normalized_model_a1.schema.json`](schemas/kicad_toolkit/normalized_model_a1.schema.json).
Compatibility fields expose the same id through the top-level `schema` field,
and consumers can compare it with `NormalizedModelSchema.CURRENT_SCHEMA_ID`.
The serialized parser return value follows the upstream
[`tscircuit/circuit-json`](https://github.com/tscircuit/circuit-json) element
array convention.

## Schematic Fields

Schematic documents include recovered `schematic` data with sheet metadata,
symbol placements, component metadata, embedded symbol graphics, wires, buses,
labels, hierarchical sheets, sheet entries, junctions, no-connect markers,
graphical shapes, embedded file metadata, simple net metadata, and the raw
KiCad S-expression AST as `kicadAst`. Coordinates remain in recovered KiCad
sheet units until the SVG renderer maps them into SVG space.

Component entries include designator, source library id, value, footprint,
unit/convert selection, placement transform, mirror/orientation metadata,
fields, properties, and BOM exclusion metadata when present.

## PCB Fields

PCB documents include recovered `pcb` data with board outline geometry, layer
metadata, declared layer definitions, primitive layer metadata, net records,
component placements, board polygons, routed tracks, routed arcs, vias, pads,
text, empty compatibility arrays for Altium-style consumers, and the
lower-level raw KiCad board model as `kicadBoard`. Summary fields expose
component, layer, outline segment, BOM, net, polygon, track, arc, via, and
board-size counts.

Coordinates projected into the public `pcb` model use mils to match the
Altium-style renderer contract. The nested `pcb.kicadBoard` model keeps raw
KiCad parser coordinates in millimeters for lower-level integrations.

Footprint-derived component placements include `componentIndex`, `designator`,
`x`, `y`, `layer`, `pattern`, `rotation`, source/description fields, value,
footprint name, properties, KiCad attribute flags, assembly/BOM exclusion
flags, mount-style hints, and nullable height metadata.

The lower-level `pcb.kicadBoard` object preserves board declarations such as
`version`, `generator`, `generatorVersion`, `embeddedFonts`, `paper`,
`titleBlock`, `general`, `properties`, declared `layers`, and `setup`.
Legacy module footprint nodes are normalized into the same footprint collection
as modern footprint nodes, with their original node type preserved on
`sourceType`.

Layer records in `pcb.layers` and `pcb.primitiveLayers` include additive
metadata for canonical KiCad layer names, standard ordinals when known, layer
side, layer class, copper participation, technical-layer status, wildcard
status, and standard-layer recognition. Declared layer definitions remain
available unchanged through `pcb.layerDefinitions` and
`pcb.kicadBoard.layers`.

Pads preserve raw KiCad pad detail while also exposing Altium-style size, shape,
drill, stack, mask, tenting, thermal relief, per-layer shape/offset, custom
primitive, pin function/type, and net metadata. Supported shape names include
KiCad pad shapes such as `rect`, `circle`, `oval`, `trapezoid`, `roundrect`,
and `custom`; unknown names remain preserved on the raw pad fields and map to a
deterministic fallback shape hint. Parser helpers expose geometry-aware pad
bound points for rectangular, circular, and oval pads so rotated pads contribute
accurate lower-level footprint and board extents. Drill offsets are preserved
on raw pads and applied by the SVG drill renderer. Custom pad primitives can
include line, circle, polygon, arc, and cubic curve geometry.

PCB drawing and copper objects use `type` values such as `line`, `circle`,
`arc`, `curve`, `polygon`, `segment`, `via`, `zone`, `dimension`, `image`,
`barcode`, `target`, and `point`. They include layer, side, material, stroke,
fill, geometry, owner, group, generated-item, and net metadata as needed by the
primitive type. Polygon and curve point lists preserve source order and flatten
inline arc segments into deterministic point sequences.

Filled zone objects preserve the first contour on `points` for compatibility
and expose all recovered contours on `contours` when the source filled polygon
contains multiple point lists. Circuit JSON polygon projections keep the first
contour in `segments` and expose additive contour segment groups on `contours`.

Text entries preserve value, transform, layer, side, mirroring, alignment, font
size, stroke thickness, visibility, and position-file exclusion metadata.
Multi-line text is preserved and rendered by the SVG renderer using the KiCad
stroke font helper. Board and footprint text variables are expanded during PCB
parsing when the referenced board, title-block, footprint, layer, or pad data is
available; unresolved variables are left unchanged.

## Library Fields

Standalone footprint library files emit a `footprint-library` root with
`fileType: "kicad_mod"`. The model exposes the recovered `footprint`, a
single-entry `footprints` array, flattened `pads`, footprint `drawings`,
`texts`, `models`, and `pcbLibrary.footprints` metadata. The parser reuses the
same lower-level footprint path as `.kicad_pcb` parsing, so pad geometry,
text, drawings, attributes, properties, and 3D model transforms follow the
board parser shapes.

Standalone symbol library files emit a `symbol-library` root with
`fileType: "kicad_sym"`. The model exposes top-level `symbols` plus
`schematicLibrary.symbols`. Each symbol preserves its KiCad library name,
item name, direct properties, pins, nested unit/body symbol records, simple
graphics grouped by primitive type, and the raw symbol S-expression node.

Library table files emit a `library-table` root with `fileType:
"fp_lib_table"` or `"sym_lib_table"`. Rows expose KiCad nickname, plugin type,
URI, resolved URI when variables are provided, pipe-separated options,
description, enabled state, and raw row nodes.

`KicadLibraryIndexBuilder.build(entries)` emits a `library-index` root. It
combines parsed table rows with local `.pretty` footprint libraries, packed
`.kicad_sym` symbol libraries, unpacked `.kicad_symdir` symbol libraries, and
design block folders. The model exposes `tables`, `tableRows`, `libraries`,
and searchable `items` for footprints, symbols, and design blocks.
`KicadLibrarySearchIndex` provides exact, prefix, keyword, and lightweight
fuzzy lookup over those items or standalone library roots.
`KicadLibraryRenderManifestBuilder` emits deterministic render/export
descriptors with stable SVG keys for footprints, symbols, design blocks, and
mixed library-index items.

## Auxiliary Fields

`.kicad_jobset` files emit a `jobset` root with `jobs`, `outputs`, raw JSON,
and job/output counts.
`KicadJobsetDigestBuilder` emits a `jobset-digest` root with `jobsets`,
`destinations`, normalized `jobs`, `jobsByDestination`, and
`destinationsById`.

`.kicad_dru` files emit a `design-rules` root with `version`, custom `rules`,
component class assignments, constraints, disallow records, and raw rule
S-expression nodes.

`.kicad_wks` files emit a `worksheet` root with setup defaults, worksheet
lines, rectangles, text blocks, polygons, bitmaps, and raw worksheet AST.

Exported `.net` files emit a `netlist` root with components, component
properties, library source metadata, nets, and net nodes.

`.cmp` files emit a `footprint-associations` root with component reference,
value, and footprint association rows.

`.kicad_blocks` and `.kicad_block` folders are indexed by
`KicadDesignBlockLibraryParser.build(entries)` into a `design-block-library`
root with block metadata, schematic file references, and board file
references.

Legacy `.lib`, `.dcm`, and `.mod` files emit a `legacy-library` root with
lightweight symbol, documentation, and module inspection records. These helper
records are intentionally not a full conversion to modern `.kicad_sch`,
`.kicad_sym`, or `.kicad_mod` models.

## Project Loading Fields

`KicadProjectLoader` returns a loader container rather than a normalized parser
root. Direct board loads include the lower-level `board`, Circuit JSON
`documents`, `rendererDocuments` for integrations that still need the legacy
object shape, a compact `project` summary, passive `libraries` manifest,
companion `assets`, `diagnostics`, `sourceFileName`, and `sourceText`. Full
project ZIP loads include parsed
schematic and PCB Circuit JSON `documents`, `rendererDocuments`, a `project`
summary with document counts, project-level net references, grouped BOM rows,
library counts, local library item counts, companion 3D `assets`, and
diagnostics for missing hierarchical sheets. The project summary also exposes
`rootSchematic` and ordered `pages`; each page record includes `kind`,
`fileName`, `title`, `path`, `page`, and `root`.

`KicadEmbeddedAssetInventoryBuilder` emits an `asset-inventory` root with
`assets` and `assetsByKind` rows for embedded schematic files, schematic
images, worksheet bitmaps, PCB 3D model references, and companion project
assets. Model-reference rows mark `available` when a matching companion asset
entry is present.

`KicadProjectDocumentGraphBuilder` emits
`kicad-toolkit.project.document-graph.a1` reports. Graph rows include parsed
documents, project pages, linked libraries, design blocks, jobsets, generated
outputs, assets, missing-path checks, grouped path lists, and indexes by path,
kind, library kind, and generated-output source.

`KicadCiArtifactBundleBuilder` emits
`kicad-toolkit.ci.artifact-bundle.a1` reports for deterministic CI workflows.
The bundle includes normalized models, a project design bundle, document graph,
netlist JSON, wirelist text, BOM rows, PnP rows, schematic SVGs, per-layer PCB
SVGs, parsed-board readiness reports, schematic QA reports, asset inventory,
and collected diagnostics. It is data only and does not write output files.

## Project Fields

`KicadProjectMetadataParser` emits a normalized `project-metadata` root for
`.kicad_pro` JSON. It preserves KiCad `meta`, `boards`, `sheets`,
`topLevelSheets`, `textVariables`, `libraries`, `netSettings.classes`, and
`board.designSettings` rows. Board design settings normalize keyed KiCad rules
into sorted `{ name, value }` rows while preserving track width, via dimension,
diff-pair, DRC-exclusion, and default-setting collections.

`ProjectDesignBundleBuilder` emits a normalized `design-bundle` root for
multi-document consumers. Bundle rows include `project`, `variants`, `sheets`,
`components`, `schematic_hierarchy`, `pnp`, `nets`, `annotations`, `indexes`,
and `bom`. `ProjectVariantViewBuilder` exposes an effective variant view with
KiCad DNP flags and project variant overrides applied. `ProjectNetlistExporter`
emits `kicad-toolkit.netlist.a1` JSON and deterministic line-oriented
wirelists from either a bundle or an effective variant.

## Helper Report Fields

Capability inventory and readiness helpers return separate report objects. They
are not serialized into Circuit JSON arrays and do not change the normalized
model schema id.

`KicadToolkitCapabilities.inventory()` returns records with stable capability
ids, categories, safety classes, dependency labels, browser and Node support
flags, dry-run support, backup behavior, mutation behavior, output shapes, and
summaries.

`KicadReadinessReport.parseDrcReport()` and `parseErcReport()` return
normalized issue records with `category`, `severity`, `rule`, `message`, and
optional source details such as `items`, `pos`, `uuid`, `excluded`, and
`details`. Summary helpers return counts by severity, rule, and category plus a
small examples list.

`KicadReadinessReport.fabricationReadiness()` returns a parsed-board readiness
object with `ok`, `readiness`, `score`, `findingCounts`, `findings`,
`statistics`, `outline`, `connectivity`, and `bounds`. It derives those fields
from recovered parser data only.

`KicadSchematicConnectivityQaBuilder.build()` returns
`kicad-toolkit.schematic.connectivity-qa.a1` reports with counts and findings
for implicit net names, dangling labels, orphan sheet entries, unconnected
visible pins, and ambiguous junctions.

`KicadSvgModelCrossLinkValidator.validate()` returns
`kicad-toolkit.svg-model-cross-link.a1` reports with expected semantic element
keys, found SVG element keys, missing elements, orphan elements, unresolved
references, metadata element rows, and summary counts. The validator reads SVG
markup strings and parsed models only.

`KicadParserCompatibilityFuzzer.run()` returns
`kicad-toolkit.parser-compatibility-fuzz.a1` reports for deterministic
synthetic parser smoke cases. Each case records the parser entrypoint, source
file name, status, normalized summary, and any captured error message.

## Compatibility Rule

Consumers should treat unknown fields as additive within the same schema id.
Parser fixes may add detail, but existing field names and shapes should stay
compatible unless a new schema id explicitly documents a model migration.
