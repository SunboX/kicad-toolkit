<!--
SPDX-FileCopyrightText: 2026 André Fiedler
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# kicad-toolkit 1.1.5

Version 1.1.5 corrects the clean-checkout formatting gate for the coordinated
native-fidelity release.

- Restores Prettier's canonical spacing for an empty `for`-loop update clause
  in the schematic image decoder.
- Keeps the `KicadExtensionResolver`, `kicad.native-model` retention, canonical
  CircuitJSON projection, renderer behavior, and all public API shapes from
  1.1.4 unchanged.
- Retains the `circuitjson-toolkit@^1.1.2` dependency baseline.

This release exists so clean Linux CI, GitHub Packages, local npm consumers,
and ECAD Forge all verify the same published source tree.
