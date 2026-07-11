<!--
SPDX-FileCopyrightText: 2026 André Fiedler
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# kicad-toolkit 1.1.3

Version 1.1.3 makes the common asynchronous worker contract work for complete
KiCad projects and binary assets without private transport fields.

## Worker compatibility

- `ProjectLoader.loadAsync()` now sends the same public `{ name, data,
assets? }` entries accepted by every ECAD toolkit. The worker derives asset
  byte accounting after structured cloning instead of requiring the private
  sender-only `assetBytes` value.
- Browser worker loading supports multi-entry `.kicad_pro`, `.kicad_sch`, and
  `.kicad_pcb` projects directly. This removes the production rejection
  reported as `KiCad project entry asset snapshots are invalid`.
- `Parser.parseAsync()` and `ProjectLoader.loadAsync()` both preserve full
  binary assets across the shared CircuitJSON worker protocol. The `none`,
  `metadata`, and `full` asset modes enforce the same asset-inclusive archive
  limits on direct and worker paths.
- The default non-transferring worker mode leaves caller buffers intact.
  `transferInput: true` transfers exact caller-owned buffers consistently with
  the other toolkits.

## Performance and compatibility

Worker requests no longer prepare and copy KiCad source bytes or assets before
the shared protocol owns or transfers them. Direct parsing still takes its
owned snapshot before progress callbacks or host turns. Public names,
parameters, package subpaths, document envelopes, and project envelopes remain
unchanged from 1.1.2.
