<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Model Format

`KicadPcbParser.parse()` returns a normalized board object optimized for
assembly-style SVG rendering.

## Board

The board object contains:

- `fileName`: source file name passed through parser options
- `title`: KiCad title block title, or an empty string
- `revision`: KiCad title block revision, or an empty string
- `outlines`: Edge.Cuts drawing primitives used for board shape rendering
- `drawings`: non-outline drawing primitives, copper primitives, footprint
  artwork, vias, and filled zones
- `footprints`: parsed footprint placement models
- `pads`: flattened pad list from all footprints
- `texts`: flattened board and footprint text list
- `bounds`: `{ minX, minY, maxX, maxY, width, height }`
- `diagnostics`: reserved array for future parser diagnostics

Coordinates are expressed in KiCad millimeters. Back-side rendering is handled
by the renderer through a scene transform, so model coordinates remain in the
board coordinate system.

## Footprints

Footprint objects include `id`, `libraryName`, `reference`, `attributes`,
`excludeFromPositionFiles`, `layer`, `side`, `x`, `y`, `rotation`, `pads`,
`texts`, `drawings`, and `bounds`.

`side` is one of `front`, `back`, or `both`, derived from KiCad layer metadata.

## Pads

Pad objects include `id`, `footprintId`, `footprintReference`, `number`, `type`,
`shape`, `x`, `y`, `rotation`, `width`, `height`, `drill`,
`roundrectRatio`, `layers`, `side`, and `netName`.

Supported shapes include KiCad pad shapes such as `rect`, `circle`, `oval`,
`roundrect`, and `custom`. Unknown shapes are preserved in the `shape` field and
rendered with the nearest deterministic fallback.

## Drawings

Drawing objects use `type` values such as `line`, `rect`, `circle`, `arc`,
`polygon`, `segment`, `via`, and `zone`. They include layer, side, material,
stroke, fill, point, and ownership metadata as needed by the primitive type.

## Text

Text objects include `id`, optional `ownerId`, optional `propertyName`, `value`,
`x`, `y`, `rotation`, `layer`, `side`, `mirrored`, `hAlign`, `vAlign`, `sizeX`,
`sizeY`, `thickness`, `visible`, and `excludeFromPositionFiles`.

Multi-line text is preserved in `value` and rendered by the SVG renderer using
the KiCad stroke font helper.
