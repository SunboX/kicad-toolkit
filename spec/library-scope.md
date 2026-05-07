<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Library Scope

KiCad Toolkit provides reusable native KiCad parsing and non-interactive
rendering primitives.

## In Scope

- `.kicad_sch` and `.kicad_pcb` parsing from `ArrayBuffer`
- S-expression parser utilities needed by KiCad files
- Direct board-file and project ZIP loading helpers
- Project summary, grouped BOM, companion asset, and hierarchical schematic
  diagnostics for loaded KiCad projects
- Board geometry helpers
- KiCad layer side and net resolution
- Schematic SVG rendering
- PCB SVG rendering
- BOM HTML rendering
- PCB 3D scene-description data
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
