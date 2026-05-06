<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Library Scope

KiCad Toolkit provides reusable KiCad PCB parsing and non-interactive rendering
primitives.

## In Scope

- `.kicad_pcb` parsing from source text
- S-expression parser utilities needed by KiCad files
- Direct board-file and ZIP archive loading helpers
- Board geometry helpers
- KiCad layer side resolution
- PCB SVG rendering for front and back side views
- KiCad stroke-font text rendering
- Optional renderer CSS

## Out Of Scope

- Application state management
- File picker, drag/drop, or session orchestration
- WebMCP bridge and external app integrations
- Project ZIP export/import and saved app settings
- Layer palette and badge style normalization
- Component highlighting and badge overlays
- PNG export or download orchestration
- Server, deployment, and app metadata endpoints
- DOM event binding, pan/zoom controllers, or UI controls
