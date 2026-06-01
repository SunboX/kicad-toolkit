<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# KiCad / Altium Feature Parity Design

## Goal

Bring `kicad-toolkit` to feature-level parity with `altium-toolkit` where the
same user-facing capability makes sense for native KiCad data.

Parity is defined by capabilities, not by copying source-format internals.
KiCad Toolkit should expose equivalent parser, renderer, model, documentation,
and test guarantees for KiCad inputs. It should not add Altium-only concepts
such as OLE stream parsing, `.PcbDoc` binary primitive helpers, `.PcbLib`
stream extractors, or `.PrjPcb` INI parsers.

## Current Context

Both packages already share the same top-level entrypoint pattern:

- package root re-exports parser, renderer, and 3D scene APIs
- `parser`
- `netlist-query`
- `renderers`
- `scene3d`
- parser worker
- renderer CSS

KiCad Toolkit also already includes several KiCad-native capabilities that are
broader than Altium Toolkit in different areas: direct board/project ZIP
loading, KiCad layer metadata, geometry helpers, capability inventory, DRC/ERC
normalization, and parsed-board readiness summaries.

The main risk is ambiguous parity. A literal helper-by-helper copy would expose
weak or misleading KiCad APIs. The implementation should instead make parity
auditable and fill real user-facing gaps.

## In Scope

1. Add an auditable feature parity inventory for KiCad Toolkit.
2. Compare the inventory to Altium Toolkit's documented feature surface.
3. Mark explicit exemptions for source-format-specific Altium capabilities.
4. Add or improve KiCad-native implementations only for genuine missing
   user-facing capabilities.
5. Keep all changes inside the library scope described by `spec/library-scope.md`.
6. Add focused tests for every added or changed behavior.
7. Update docs when capabilities, entrypoints, or guarantees change.

## Out Of Scope

- OLE compound document support.
- Altium binary stream parsing.
- `.SchDoc`, `.PcbDoc`, `.PcbLib`, or `.PrjPcb` parsing.
- KiCad project ZIP export or app download orchestration.
- DOM event wiring, file picker handling, drag/drop orchestration, state
  management, WebMCP bridge code, or host app interaction.
- Three.js runtime object creation, controls, picking, canvas mounting, or STEP
  mesh loading.
- Special cases for a file name, customer project, vendor identifier, fixture
  helper, or source-derived phrase.

## Feature Parity Contract

The KiCad parity inventory will group capabilities under these categories:

- **Parser roots**: `.kicad_sch` and `.kicad_pcb` parsing from `ArrayBuffer`.
- **Project loading**: direct board files and project ZIP archives with
  documents, renderer compatibility documents, project summary, BOM, assets,
  and diagnostics.
- **Model contracts**: Circuit JSON arrays, non-serialized renderer
  compatibility fields, normalized model schema id, and JSON schema
  publication.
- **Raw inspectability**: raw KiCad AST/model preservation through
  `schematic.kicadAst` and `pcb.kicadBoard`.
- **Schematic rendering**: deterministic SVG for recovered KiCad schematic
  primitives.
- **PCB rendering**: deterministic SVG for recovered board outline, layers,
  pads, vias, copper, drawings, text, and side-resolved views.
- **BOM rendering**: grouped BOM HTML for parsed rows.
- **Netlist query**: browser-safe loaded-design component/net search and
  connectivity traversal.
- **3D scene data**: data-only board, component, copper, text, silkscreen,
  drill-cutout, and external model placement scene descriptions.
- **Worker support**: parser worker entrypoint for host applications.
- **Renderer CSS**: optional stylesheet export.
- **Diagnostics/reporting**: capability inventory, DRC/ERC report
  normalization, and parsed-board readiness summaries.
- **Documentation/testing**: API docs, model format docs, scope docs, schema,
  README usage, and focused tests.

Each capability entry should state whether it is implemented, KiCad-native,
covered by tests, and documented. Altium-only features should be listed as
format-specific exemptions with a short reason.

## Architecture

Add the parity contract as a KiCad-native reporting layer instead of scattering
comparison logic through parser or renderer modules.

The preferred location is a small parser-side helper in `src/core/kicad/`,
exported through `src/parser.mjs` if it becomes part of the public API. It can
reuse existing capability inventory data from `KicadToolkitCapabilities` where
that already describes a feature, and add parity-specific metadata where needed.

Tests should validate the contract from the public entrypoints where practical.
The tests should not import Altium internals directly as a runtime dependency.
If a comparison table is useful, it should be represented in KiCad tests as
repo-owned expected data derived from the documented parity categories above.

## Data Flow

1. A host or test calls the KiCad parity inventory helper.
2. The helper returns plain JSON-compatible category records.
3. Each record describes the KiCad capability, implementation status, relevant
   public entrypoint, documentation target, test target, and optional
   Altium-only exemption reason.
4. Docs summarize the same categories for humans.
5. Existing parser and renderer modules continue to own actual parsing and
   rendering behavior.

## Error Handling

The parity inventory should not throw for normal use. Unknown filters or empty
queries should return empty lists or the complete inventory according to the
existing `KicadToolkitCapabilities.inventory()` style.

Parser and renderer fixes discovered during parity work should keep their
current error behavior unless a test proves the behavior is an observable
capability gap.

## Testing

Tests will use `npm test` only.

Coverage should include:

- public API exports for the parity helper if one is added
- inventory categories and Altium-only exemption records
- docs references for the parity contract
- any parser or renderer behavior added to close a real parity gap
- existing package layout and line-limit checks

Fixtures must stay fake and repo-owned.

## Acceptance Criteria

- KiCad Toolkit has an auditable feature-level parity contract.
- Altium-only capabilities are explicitly exempted rather than silently missing.
- Any genuine KiCad capability gap found during implementation is covered by
  focused tests and docs.
- Existing public entrypoints continue to work.
- `npm test` passes.
