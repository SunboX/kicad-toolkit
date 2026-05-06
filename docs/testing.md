<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Testing

Run the full test suite with:

```bash
npm test
```

Tests use Node's built-in `node:test` runner and repo-owned fake KiCad fixtures
under `tests/fixtures/`.

Parser tests assert normalized board metadata, footprint transforms, layer side
resolution, copper primitive extraction, ZIP board loading, and S-expression
parsing.

Renderer tests assert deterministic SVG output, front/back visibility,
KiCad stroke text behavior, and pad strokes.

Do not add customer, vendor, or source project KiCad files as fixtures. Create
small fake `.kicad_pcb` samples that isolate the behavior being tested.
