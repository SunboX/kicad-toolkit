<!--
SPDX-FileCopyrightText: 2026 André Fiedler
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# kicad-toolkit 1.1.1

Version 1.1.1 completes the exact common package-subpath contract introduced in
1.1.0.

## API layout fix

- `kicad-toolkit/parser` now exports `CircuitJsonDocumentContext` alongside the
  other shared parser contract classes.
- `kicad-toolkit/project` now exports `ZipArchiveInspector` alongside the shared
  archive and project-result classes.
- Both names are direct re-exports from `circuitjson-toolkit`, so consumers see
  the same class identities across the four ECAD toolkits.
- KiCad's format-owned `Parser` and `ProjectLoader` remain unchanged and retain
  the same identities at the package root and their dedicated subpaths.

## Compatibility

The patch does not change parsing, project loading, CircuitJSON envelopes,
native extensions, renderer output, or performance behavior. It only restores
the two missing shared subpath exports discovered by a clean npm-registry
consumer installation.
