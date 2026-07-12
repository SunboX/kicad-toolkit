<!--
SPDX-FileCopyrightText: 2026 André Fiedler
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# kicad-toolkit 1.1.4

Version 1.1.4 adds an explicit, source-checked bridge from canonical
CircuitJSON documents to retained native KiCad renderer models.

## Native fidelity routing

- `KicadExtensionResolver.nativeModel(document)` returns the retained
  `extensions.kicad.native` record only for canonical KiCad documents and
  returns `null` when native retention is absent or the source format differs.
- `KicadExtensionResolver.hasNativeModel(document)` exposes the same decision
  as a boolean without changing the document shape.
- Historical KiCad renderer models pass through the resolver unchanged when
  they carry an owned KiCad schema or `sourceFormat` marker. Inherited fields
  and accessors are not trusted or invoked.
- `Parser` and `ProjectLoader` retain the native model in the same parse when
  called with `extensions: ['kicad.native-model']`; no second parse or app-side
  adapter is required.

## Compatibility and dependency baseline

Canonical CircuitJSON remains the default path for shared queries, BOM,
manufacturing, simulation, and 3D scenes. Native retention is opt-in and no
existing API was removed. The package now depends on
`circuitjson-toolkit@^1.1.2` for the coordinated renderer and canonical-model
fixes used by ECAD Forge.
