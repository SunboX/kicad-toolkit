<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Model Format

The normalized model is intentionally stable with the ECAD Forge parser model.
The parser returns one object per parsed native KiCad document.

## Common Fields

- `schema`: normalized model schema id, currently
  `urn:kicad-toolkit:normalized-model:a1`
- `sourceFormat`: `kicad`
- `kind`: `schematic` or `pcb`
- `fileType`: `kicad_sch` or `kicad_pcb`
- `fileName`: original file name passed to the parser
- `summary`: compact document metadata and recovered item counts
- `diagnostics`: parser warnings and recovery notes
- `bom`: grouped component metadata where available

## Schema Contracts

The current root model contract is published as a JSON Schema at
[`docs/schemas/kicad_toolkit/normalized_model_a1.schema.json`](schemas/kicad_toolkit/normalized_model_a1.schema.json).
Parser roots expose the same id through the top-level `schema` field, and
library consumers can compare it with
`NormalizedModelSchema.CURRENT_SCHEMA_ID`.

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
metadata, primitive layer metadata, net records, component placements, board
polygons, routed tracks, routed arcs, vias, pads, text, empty compatibility
arrays for Altium-style consumers, and the lower-level raw KiCad board model as
`kicadBoard`. Summary fields expose component, layer, outline segment, BOM,
net, polygon, track, arc, via, and board-size counts.

Coordinates projected into the public `pcb` model use mils to match the
Altium-style renderer contract. The nested `pcb.kicadBoard` model keeps raw
KiCad parser coordinates in millimeters for lower-level integrations.

Footprint-derived component placements include `componentIndex`, `designator`,
`x`, `y`, `layer`, `pattern`, `rotation`, source/description fields, value,
footprint name, properties, KiCad attribute flags, assembly/BOM exclusion
flags, mount-style hints, and nullable height metadata.

Pads preserve raw KiCad pad detail while also exposing Altium-style size, shape,
drill, stack, mask, tenting, thermal relief, per-layer shape/offset, custom
primitive, pin function/type, and net metadata. Supported shape names include
KiCad pad shapes such as `rect`, `circle`, `oval`, `trapezoid`, `roundrect`,
and `custom`; unknown names remain preserved on the raw pad fields and map to a
deterministic fallback shape hint.

PCB drawing and copper objects use `type` values such as `line`, `circle`,
`arc`, `curve`, `polygon`, `segment`, `via`, `zone`, `dimension`, `image`,
`barcode`, `target`, and `point`. They include layer, side, material, stroke,
fill, geometry, owner, group, generated-item, and net metadata as needed by the
primitive type.

Text entries preserve value, transform, layer, side, mirroring, alignment, font
size, stroke thickness, visibility, and position-file exclusion metadata.
Multi-line text is preserved and rendered by the SVG renderer using the KiCad
stroke font helper.

## Project Loading Fields

`KicadProjectLoader` returns a loader container rather than a normalized parser
root. Direct board loads include the lower-level `board`, wrapped `documents`,
a compact `project` summary, companion `assets`, `diagnostics`,
`sourceFileName`, and `sourceText`. Full project ZIP loads include parsed
schematic and PCB `documents`, a `project` summary with document counts,
project-level net references, grouped BOM rows, companion 3D `assets`, and
diagnostics for missing hierarchical sheets.

## Compatibility Rule

Consumers should treat unknown fields as additive within the same schema id.
Parser fixes may add detail, but existing field names and shapes should stay
compatible unless a new schema id explicitly documents a model migration.
