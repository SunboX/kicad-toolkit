# kicad-toolkit 1.2.0

This minor release restores exact KiCad PCB rendering fidelity through the
canonical CircuitJSON boundary. The shared model is now sufficient for the 3D
viewer; hosts do not need KiCad-specific geometry workarounds.

## API additions

- Plated and non-plated holes preserve circular and slotted drill shapes,
  independent outer-pad and drill rotations, board-space drill offsets, and
  rectangular, rounded, pill, circular, or custom polygon copper geometry.
- Canonical plated-hole rows may use `rect_border_radius`,
  `rect_ccw_rotation`, `hole_ccw_rotation`, `hole_offset_x`, `hole_offset_y`,
  and `pad_outline` when those fields are present in the KiCad source.
- PCB text rows retain independent `font_width` and `font_height`, exact source
  anchors, mirroring, visibility, layer/type provenance, and stroke width.
- Filled footprint and board artwork retains `fill: true`, including filled
  silkscreen polygons.

## Behavior

- Oval/slotted through-hole pads no longer collapse to circular copper.
- Filled and stroked silkscreen details survive the shared-model conversion.
- Text anchors and dimensions remain source-faithful instead of being reduced
  to one square font size and center placement.
- The package now consumes `circuitjson-toolkit@^1.2.0`; the added fields are
  validated by the shared immutable document boundary.

No existing KiCad public class, method, parameter, package subpath, document
envelope, or retained native extension is removed.
