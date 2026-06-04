<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Library Scope

KiCad Toolkit provides reusable native KiCad parsing and non-interactive
rendering primitives.

## In Scope

- `.kicad_sch`, `.kicad_pcb`, `.kicad_mod`, `.kicad_sym`,
  `.kicad_jobset`, `.kicad_dru`, `.kicad_wks`, `.net`, `.cmp`, legacy
  `.lib`/`.dcm`/`.mod`, `fp-lib-table`, and `sym-lib-table` parsing from
  `ArrayBuffer`
- S-expression parser utilities needed by KiCad files
- Direct board-file and project ZIP loading helpers
- KiCad library table, `.pretty`, `.kicad_symdir`, `.kicad_blocks`, and
  `.kicad_block` manifest, search, and render-manifest helpers
- Project summary, grouped BOM, companion asset, asset inventory, jobset
  digest, and hierarchical schematic diagnostics for loaded KiCad projects
- Board geometry helpers
- KiCad layer side/class metadata, standard ordinal, alias, wildcard, and net
  resolution
- Generic board-coordinate geometry helpers for rotated rectangles, primitive
  bounds, and supported shape clearances
- Read-only parser/rendering capability inventory with safety, dependency,
  dry-run, and backup support metadata
- Normalized caller-supplied DRC/ERC report summaries and parsed-board
  fabrication-readiness summaries
- Schematic-local connectivity QA summaries from parsed KiCad model data
- Schematic SVG rendering
- PCB SVG rendering
- BOM HTML rendering
- PCB 3D scene-description data, including external model placement metadata,
  copper text detail, and silkscreen drill cutouts
- KiCad stroke-font text rendering
- Static 3D summary HTML
- Parser worker entrypoint for host applications
- Optional renderer CSS
- Versioned normalized model schema identifiers and machine-readable schema
  contracts

## Out Of Scope

- Application state management
- File picker, drag/drop, or session orchestration
- Schematic/PCB pan and zoom event controllers
- Three.js runtime, OrbitControls, canvas mounting, and picking
- STEP mesh loading and browser script injection
- WebMCP bridge and external app integrations
- Project ZIP export UI and download orchestration
- Saved app settings
- PNG export or download orchestration
- Server, deployment, and app metadata endpoints
- DOM event binding or UI controls
- External command wrappers, tool orchestration, or fabrication-output
  generation
