<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Capabilities

KiCad Toolkit exposes a read-only capability inventory and normalized report
helpers so host applications can describe parser, rendering, and readiness
support without probing individual classes.

## Capability Inventory

`KicadToolkitCapabilities.inventory(options)` returns a filterable feature
matrix. The inventory is data only; it does not parse files, invoke external
tools, mutate input, create backups, or write output files.

```js
import { KicadToolkitCapabilities } from 'kicad-toolkit/parser'

const reporting = KicadToolkitCapabilities.inventory({
    category: 'reporting'
})
```

Each capability includes:

| Field             | Meaning                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `id`              | Stable machine-readable capability id                            |
| `label`           | Human-readable feature name                                      |
| `category`        | Feature area such as `parser`, `rendering`, or `reporting`       |
| `safety`          | Current mutation class; all built-in records are `read_only`     |
| `requires`        | Runtime dependency labels, or an empty list when none are needed |
| `outputs`         | Main output shapes produced by the capability                    |
| `supportsBrowser` | Whether the capability is intended for browser runtimes          |
| `supportsNode`    | Whether the capability is intended for Node.js runtimes          |
| `supportsDryRun`  | Whether the capability has a meaningful write dry-run mode       |
| `createsBackup`   | Whether the capability creates backup files                      |
| `mutatesInput`    | Whether the capability mutates caller-provided data              |
| `summary`         | Short behavior summary                                           |

The response also contains aggregate counts:

- `categories`: category labels, descriptions, and matching counts
- `safetyCounts`: capability counts by safety class
- `dependencyCounts`: dependency label counts, with `none` for dependency-free
  capabilities
- `dryRunCounts`: counts for capabilities with meaningful dry-run behavior
- `backupCounts`: counts for capabilities that create backups

All current package capabilities are `read_only`. `supportsDryRun` and
`createsBackup` are false because the library does not perform write operations.

## Feature Parity Inventory

`KicadFeatureParity.inventory(options)` returns a read-only parity contract for
Altium Toolkit user-facing capabilities that have KiCad-native equivalents.
The helper is data only; it does not parse files, render documents, mutate
input, create backups, or invoke external tools.

```js
import { KicadFeatureParity } from 'kicad-toolkit/parser'

const parity = KicadFeatureParity.inventory()
const pcbRendering = KicadFeatureParity.inventory({
    category: 'pcb_rendering'
})
```

Each implemented feature includes:

| Field              | Meaning                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| `id`               | Stable machine-readable parity feature id                                     |
| `label`            | Human-readable feature name                                                   |
| `category`         | Parity area such as `parser_roots`, `pcb_rendering`, or `scene3d`             |
| `status`           | Current implementation status; built-in features are `implemented`            |
| `kicadNative`      | Whether the capability is KiCad-native rather than an adapted shared contract |
| `altiumCapability` | Altium Toolkit user-facing capability being matched                           |
| `kicadCapability`  | KiCad Toolkit capability that provides the equivalent behavior                |
| `entrypoints`      | Public package entrypoints that expose the capability                         |
| `docs`             | Documentation files that describe the capability                              |
| `tests`            | Test files that cover the capability                                          |
| `summary`          | Short behavior summary                                                        |

The response includes aggregate `categories`, `statusCounts`, `nativeCounts`,
and `featureCoverage` fields. Unknown filters are treated as empty result sets,
so host applications can probe optional categories without handling exceptions.

### Source-Format Exemptions

Some Altium Toolkit capabilities are intentionally not copied because they are
specific to Altium file storage rather than shared EDA-library behavior. The
`exemptions` list records these cases with the Altium capability, the reason it
does not apply to native KiCad files, and the closest KiCad equivalent.

Current exemptions cover OLE compound documents, Altium binary primitive
streams, `.PcbLib` stream parsing, `.PrjPcb` INI parsing, Altium raw record
registries, and embedded Altium binary payload extraction. KiCad equivalents
are S-expression parsing, project ZIP loading, raw KiCad AST/model
preservation, companion asset metadata, and KiCad stroke-font rendering.

## Report Normalization

`KicadReadinessReport` normalizes caller-supplied DRC and ERC report data into
a compact issue shape. The helpers accept JSON strings, objects, or arrays that
contain report issue lists such as `violations`, `warnings`, `errors`,
`exclusions`, `unconnected_items`, `schematic_parity`, or `items`.

```js
import { KicadReadinessReport } from 'kicad-toolkit/parser'

const normalized = KicadReadinessReport.parseDrcReport(reportJson, {
    includeItems: false,
    severity: 'error'
})

const ercSummary = KicadReadinessReport.summarizeErcReport(ercJson)
```

Normalized issues include:

| Field      | Meaning                                                    |
| ---------- | ---------------------------------------------------------- |
| `category` | Source issue-list category                                 |
| `severity` | Normalized lowercase severity                              |
| `rule`     | Rule, type, code, constraint, or category fallback         |
| `message`  | Human-readable description                                 |
| `items`    | Optional source item detail when `includeItems` is enabled |
| `pos`      | Optional source position detail                            |
| `uuid`     | Optional source UUID                                       |
| `excluded` | Optional source exclusion flag                             |
| `details`  | Optional source detail payload                             |

`parseDrcReport()` and `parseErcReport()` return issue lists with totals and
counts by severity, rule, and category. `summarizeDrcReport()` and
`summarizeErcReport()` return the same counts plus a small `examples` array.

Supported options:

| Option         | Meaning                                                    |
| -------------- | ---------------------------------------------------------- |
| `includeItems` | Defaults to true for parse helpers and false for summaries |
| `limit`        | Maximum returned issues for parse helpers                  |
| `exampleLimit` | Maximum examples returned by summary helpers               |
| `severity`     | Case-insensitive exact severity filter                     |
| `rule`         | Case-insensitive exact rule filter                         |
| `category`     | Case-insensitive exact category filter                     |

## Fabrication Readiness

`KicadReadinessReport.fabricationReadiness(input)` summarizes a parsed board
model using recovered library data only. It accepts a lower-level
`pcb.kicadBoard` model, a renderer compatibility document, or a wrapper with
`{ kicadBoard }`.

```js
const readiness = KicadReadinessReport.fabricationReadiness(
    documentModel.pcb.kicadBoard
)
```

The readiness response contains:

| Field           | Meaning                                                                    |
| --------------- | -------------------------------------------------------------------------- |
| `ok`            | True when no blocker findings are present                                  |
| `readiness`     | `ready`, `review`, or `blocked`                                            |
| `score`         | 0-100 score after blocker, warning, and info penalties                     |
| `findingCounts` | Counts by `blocker`, `warning`, and `info`                                 |
| `findings`      | Normalized finding records with `severity`, `kind`, `count`, and `message` |
| `statistics`    | Footprint, pad, net, track, via, zone, and copper-layer counts             |
| `outline`       | Outline item count and unmatched endpoint count                            |
| `connectivity`  | No-net pad and unrouted multi-pad net summaries                            |
| `bounds`        | Parsed board bounds when available                                         |

Readiness findings are intentionally conservative. They flag missing or open
board outlines, insufficient copper layers, missing footprints, unrouted
multi-pad nets, no-net pads, and missing visible 3D model metadata. The helper
does not replace a full electrical, design-rule, or fabrication review.
