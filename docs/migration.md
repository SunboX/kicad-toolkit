<!--
SPDX-FileCopyrightText: 2026 André Fiedler
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Migration from 1.0.29 to 1.1.0

Version 1.1.0 intentionally changes root names, parameters, return shapes, and
package subpaths to match every other ECAD toolkit. No KiCad feature was
deleted.

Version 1.1.1 is a subpath-parity patch. Code importing
`CircuitJsonDocumentContext` from `kicad-toolkit/parser` or
`ZipArchiveInspector` from `kicad-toolkit/project` now sees the same shared
identities and exact export-key layout as the other toolkits. No parser,
project-loader, document, or native-extension behavior changed.

Version 1.1.2 corrects CircuitJSON projection for legacy footprint values,
required typed-component properties, owned footprint artwork, board-level PCB
notes, and shape-specific courtyard elements. The common `Parser` and
`ProjectLoader` signatures and their document/project envelope shapes remain
unchanged; consumers no longer need to repair these elements after parsing.

| 1.0.29                                              | 1.1.0 common API                              |
| --------------------------------------------------- | --------------------------------------------- |
| `KicadParser.parseArrayBuffer(fileName, data)`      | `Parser.parse({ fileName, data })`            |
| Augmented CircuitJSON array result                  | `ecad-toolkit.document.v1` with dense `model` |
| `KicadProjectLoader.loadEntries([{ name, bytes }])` | `ProjectLoader.load([{ name, data }])`        |
| Native renderer classes at root                     | Shared CircuitJSON renderer classes at root   |
| Native `PcbInteractionIndex.build()`                | Shared `PcbInteractionIndex.create()`         |
| Native `PcbScene3dBuilder.build()`                  | Shared CircuitJSON scene builder              |

Move unchanged native imports to the extension namespace:

```js
import {
    KicadParser,
    KicadProjectLoader,
    PcbSvgRenderer,
    PcbInteractionIndex,
    PcbScene3dBuilder
} from 'kicad-toolkit/extensions'
```

Use `kicad-toolkit/extensions/node` and
`kicad-toolkit/extensions/netlist-query` for the former Node and netlist-query
subpaths. The former worker and KiCad CSS assets are available below
`kicad-toolkit/extensions/`; the new source-neutral worker and CSS paths match
the other toolkits.

Apps should pass `{ name, data }` entries directly to the common project loader
and consume its document envelopes directly. ZIP expansion, CircuitJSON
preparation, and viewer compatibility belong in the library, not in app-side
adapters.
