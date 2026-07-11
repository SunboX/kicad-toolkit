<!--
SPDX-FileCopyrightText: 2026 André Fiedler
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Capabilities

`ToolkitCapabilities.inventory()` returns fresh clone-safe rows in stable id
order. Every row contains `id`, `category`, `operation`, `status`, `entrypoint`,
`summary`, `reason`, `tested`, and `documented`.

KiCad marks native document parsing, project loading, selected-part export, and
both worker operations as `native`. Rendering, interaction, query,
manufacturing, simulation, validation, unit conversion, and 3D preparation run
as shared CircuitJSON services. Unsupported operations remain `unavailable`
and fail explicitly rather than returning placeholders.

```js
import { ToolkitCapabilities } from 'kicad-toolkit/capabilities'

const parsing = ToolkitCapabilities.inventory().find(
    (row) => row.id === 'parse.document'
)
console.log(parsing.status, parsing.entrypoint)
```

The exhaustive source-native `KicadToolkitCapabilities` and
`KicadFeatureParity` reports remain available from `kicad-toolkit/extensions`.
See [Native Capability Inventory](native-capabilities.md).
