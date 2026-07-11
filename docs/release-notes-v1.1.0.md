<!--
SPDX-FileCopyrightText: 2026 André Fiedler
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# kicad-toolkit 1.1.0

This is the breaking API-convergence release coordinated with
`circuitjson-toolkit`, `gerber-toolkit`, `altium-toolkit`,
`pcb-scene3d-viewer`, and ECAD Forge.

## API changes

- Replaced the root with the exact 17-class common toolkit API.
- Added the common parser, project, renderer, interaction, query,
  manufacturing, simulation, 3D, capability, testing, worker, and CSS subpaths.
- Changed parsing to `Parser.parse({ fileName, data }, options)` and immutable
  `ecad-toolkit.document.v1` results containing dense CircuitJSON in `model`.
- Changed project loading to dense `{ name, data }` entries and
  `ecad-toolkit.project.v1` results.
- Added direct single-ZIP input, archive limits, traversal rejection, companion
  assets, progress, cancellation, worker fallback, and typed errors. ZIP
  central/local metadata is preflighted before inflation and extracted members
  are verified by exact size and CRC32; compression limits cannot be diluted by
  archive padding.
- Direct async parser and project paths snapshot exact byte windows, names,
  selected assets, and normalized options before callbacks or host turns.
  Worker receivers reuse structured-clone ownership instead of copying again.
- Project candidates parse independently. Valid documents survive malformed
  siblings, failed candidates emit deterministic diagnostics, and common
  `entryCount`, `candidateCount`, and `failureCount` statistics keep their exact
  meanings. Disabled extensions return the exact common `{}` map.

## Feature preservation

- Preserved the complete 1.0.29 browser-native API at
  `kicad-toolkit/extensions`.
- Preserved Node-only and native netlist query APIs at explicit extension
  subpaths.
- Preserved the old worker and KiCad renderer CSS below `/extensions`.
- Retained opt-in native renderer models without a second parse.
- Emits one canonical `cad_component` for every visible footprint model,
  preserving multiple models per footprint and diagnosing hidden models.
- Resolves `${KIPRJMOD}` from the owning `.kicad_pro` directory (with a board
  directory fallback) and direct relative model references to exact project
  asset paths while retaining unresolved variables with diagnostics.
- Separates footprint board placement from model-local offset, rotation, and
  scale, and derives top/bottom placement height from the parsed board
  thickness so the shared viewer and ECAD Forge can consume full companion
  bytes directly without format-specific workarounds.

## CircuitJSON and performance

- Uses the existing KiCad-to-CircuitJSON projection directly and strips only
  augmented array properties at the common boundary.
- Applies the shared copy-on-write CircuitJSON legacy normalization before the
  single validation pass, including canonical artwork routes, side layers, and
  component ownership, while leaving the opt-in native extension unchanged.
- Shares the same renderer, interaction, query, manufacturing, simulation, and
  3D implementations as the other toolkits.
- Parses each common document once, uses exact byte windows, classifies project
  companions in linear time, and supports off-main-thread parsing.
- Materializes 3D companion payloads only when requested by full asset mode;
  model path projection itself uses names only. Shared ToolkitAsset inference
  labels WRL/VRML companions as `model/vrml` and STEP/STP as `model/step`, so
  the viewer consumes exact bytes without a KiCad or app-side MIME adapter.
- Projects schematic rectangles, circles/ellipses, arcs, Beziers, polygons,
  text boxes, tables, hierarchical sheet symbols, and images to shared
  CircuitJSON. Child sheets retain `source_file_name` without becoming page
  selectors, and images reference exact `schematic-image` ToolkitAssets
  instead of carrying inline base64.
- Keeps provenance-bound native feature and benchmark gates while adding the
  shared observable contract suite and absolute canonical parser/project speed
  ceilings.

See [Migration from 1.0.29](migration.md) for import and return-shape changes.
