<!--
SPDX-FileCopyrightText: 2026 André Fiedler
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# kicad-toolkit 1.1.2

Version 1.1.2 makes KiCad PCB projection schema-valid CircuitJSON while
preserving the common API and document envelope introduced in 1.1.0.

## CircuitJSON correctness

- Legacy `fp_text value` fields are retained when a footprint has no modern
  `Value` property.
- Typed passive components receive their required capacitance, inductance, or
  resistance from the source value. Pin headers derive `pin_count` from their
  projected source ports. Components without enough source evidence fall back
  to a schema-valid generic type instead of inventing data.
- Footprint silkscreen and fabrication text/path elements retain their owning
  `pcb_component_id`, canonical side, route, and stroke fields.
- Board-level text and artwork use the generic `pcb_note_text` and
  `pcb_note_path` elements rather than component-owned primitives.
- Courtyard lines, arcs, circles, polygons, and rectangles map to their
  shape-specific upstream CircuitJSON elements instead of being forced into a
  rectangle.
- Rotated courtyard rectangles retain their transformed corners as polygons,
  while true axis-aligned rectangles use the compact rectangle element.
- Three-point KiCad arcs are deterministically tessellated for canonical path
  and outline consumers instead of being reduced to two straight chords.

## Compatibility and performance

The root API, package subpaths, parser parameters, project-loader parameters,
and document/project return envelopes are unchanged from 1.1.1. The fixes are
implemented in the library's one-pass CircuitJSON projection path, so ECAD
Forge and viewers consume the canonical output directly without adapters or
post-processing. The full feature-preservation and performance gates remain
green.
