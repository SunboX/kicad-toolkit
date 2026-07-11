<!--
SPDX-FileCopyrightText: 2026 André Fiedler
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Model Format

The common parser returns an immutable document envelope:

```js
{
    schema: 'ecad-toolkit.document.v1',
    modelSchema: { name: 'circuit-json', version: '0.0.446' },
    model: [],
    source: {
        format: 'kicad',
        fileName: 'board.kicad_pcb',
        fileType: 'kicad_pcb'
    },
    extensions: { kicad: {} },
    assets: [],
    diagnostics: [],
    statistics: {}
}
```

`model` is a dense CircuitJSON array with no augmented array properties. It is
the only model consumed by the common renderer, interaction, query,
manufacturing, simulation, and 3D scene services. Existing KiCad parsers
already project source structures into CircuitJSON, so the convergence layer
passes that projection through the shared
`CircuitJsonDocument.normalizeModel()` copy-on-write normalizer before
validation and protection. This canonicalizes supported pre-union aliases such
as artwork `points`/`path` routes and KiCad layer names without an app adapter
and without changing the retained native extension model.

## Canonical schematic graphics

KiCad schematic drawing families project directly to shared CircuitJSON:

- rectangles and circles retain center, size/radius, stroke, fill, dash, and
  component ownership;
- unequal ellipses use 48 deterministic path points, while cubic Beziers use
  24 segments;
- arcs retain canonical center/radius/angle/direction geometry;
- polygons, rule areas, text boxes, tables, and standalone text retain their
  representable geometry and style;
- hierarchical child boxes use `schematic_sheet_symbol`, retain
  `source_file_name`, and own their ports through
  `schematic_sheet_symbol_id`. They are not emitted as selectable
  `schematic_sheet` pages.

Embedded schematic images emit a `schematic_image` row with `asset_id`,
`center`, `size`, `rotation`, source metadata, aspect-ratio policy,
render order, and opacity. The corresponding document asset has
`kind: 'schematic-image'` and the detected image media type. Default metadata
mode retains its exact `byteLength` with `data: null`; full mode returns the
exact decoded bytes. Image base64 is never stored inline in CircuitJSON.

The default `extensions: 'canonical'` retains compact KiCad kind and summary
metadata. Select `extensions: 'full'`, `preserveRaw: true`, or
`extensions: ['kicad.native-model']` to retain the renderer-compatibility model
under `document.extensions.kicad.native` without reparsing.

`ProjectLoader` returns `ecad-toolkit.project.v1` with canonical documents,
project relationships, namespaced KiCad metadata, assets, diagnostics, and
statistics. ZIP paths and central/local metadata are validated before
inflation; extracted sizes and CRC32 values are then verified. With
`extensions: 'none'` or an empty extension selection, the exact project
extension map is `{}`.

## PCB 3D model placement

Each visible KiCad footprint `(model ...)` node is represented by a separate
CircuitJSON `cad_component`, including when one footprint has multiple visible
models. Every row links to the same `pcb_component_id` and
`source_component_id` as its footprint and has a stable per-model
`cad_component_id`.

Board and model-local transforms remain independent:

- `position` and `rotation` contain the footprint's board placement.
  `position.z` is the parsed board surface: half the board thickness for a top
  component and the negative half for a bottom component.
- `model_offset`, `model_rotation`, and `model_scale` contain the model node's
  local offset in millimeters, rotation in degrees, and axis scale.
- `model_asset.project_relative_path`, `model_asset.url`, and the matching
  `model_*_url` field contain the exact canonical project asset path.

The canonical `pcb_board.thickness` comes from KiCad's `(general (thickness
...))` value and defaults to 1.6 mm only when KiCad omits a positive thickness.
`${KIPRJMOD}` is resolved relative to the nearest owning `.kicad_pro`
directory, including the prefix introduced by a ZIP entry. The board directory
is used only when no owning project entry exists. Direct relative references
are resolved against the board directory, while already exact project asset
paths remain unchanged. Unknown variables and unsafe or unmatched references
are retained verbatim and produce diagnostics instead of being guessed. Hidden
native model nodes do not create render placements and are retained through an
informational diagnostic (and through `kicad.native-model` when that extension
is selected).

With `decodeAssets: 'full'`, project-level companion assets retain their exact
bytes. `pcb-scene3d-viewer` consumes those canonical `ToolkitAsset` payloads
directly; no ECAD Forge path or payload adapter is required.

The complete augmented-array and renderer-model reference remains in
[Native Model Format](native-model-format.md). Machine-readable schemas remain
under [`docs/schemas/kicad_toolkit/`](schemas/kicad_toolkit/).
