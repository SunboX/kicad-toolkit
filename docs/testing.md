<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Testing

Run the complete suite:

```bash
npm test
```

The tests cover:

- S-expression parsing and KiCad source decoding for `.kicad_sch` and
  `.kicad_pcb` entrypoints
- KiCad project ZIP expansion, project summary recovery, hierarchical sheet
  diagnostics, companion asset discovery, and direct board loading
- PCB layer side resolution, net recovery, footprint transforms, pad detail,
  padstack metadata, copper segments, routed arcs, vias, zones, board outlines,
  BOM rows, and normalized model schema ids
- Layer metadata aliases/classes/wildcards, analytic pad geometry bounds,
  capability inventory records, DRC/ERC report normalization, and parsed-board
  readiness summaries
- Schematic symbol recovery, embedded library graphics, labels, hierarchical
  sheets, metadata item families, simple net recovery, and BOM rows
- Schematic SVG, side-resolved PCB SVG, BOM HTML, KiCad stroke text, pad stroke,
  and static 3D summary renderers
- Non-interactive PCB 3D scene-description builders, package fallback logic, and
  model registry behavior
- Package entrypoints, documentation files, example server behavior, and project
  structure constraints

Fixture data must remain repo-owned and fake. Do not add native provided KiCad
files, real customer identifiers, real vendor identifiers, or
source-descriptive fixture names.
