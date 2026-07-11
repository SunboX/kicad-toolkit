<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Testing

Run the complete suite:

```bash
npm test
npm run check:features -- --strict
npm run benchmark
npm run check:format
```

The tests cover:

- the exact shared root/package contract, canonical document and project
  envelopes, direct ZIP loading, common services, workers, progress,
  cancellation, archive safety, and typed errors
- exhaustive provenance-bound preservation of the native 1.0.29 API from the
  packed extension namespace
- historical native regression comparisons plus absolute runtime ceilings for
  the new canonical parser and project paths
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
