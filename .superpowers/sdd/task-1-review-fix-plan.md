# KiCad Task 1 Review Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace heuristic Task 1 baselines with audited, exhaustive, reproducible contracts whose strict checker validates the packed package without shipping development artifacts.

**Architecture:** A frozen mapping catalog will own every export, capability, and parity preservation decision. A shared API contract inspector will capture callables, delegated options, documented nested result shapes, and worker protocol fields; both baseline generation and strict packed-package validation will use that same inspector. Baseline source files will come from an archive of `c71c88d69d236accce123656dfa66914c0d5489c`, while outputs remain in the active clean HEAD.

**Tech Stack:** Node.js 20+, ESM, `node:test`, Git archive, npm pack, Prettier 3.

## Global Constraints

- Preserve baseline identity `kicad-toolkit@1.0.29` and source tree from `c71c88d69d236accce123656dfa66914c0d5489c`.
- Keep every JavaScript file below 1,000 lines and document every named function or method with JSDoc.
- Use only synthetic or repository-owned test inputs.
- Keep `.superpowers/` untracked and leave the original worktree untouched.
- Do not weaken strict checks or package tests to accept a fixture-specific result.

---

### Task 1: Audit preservation ownership

**Files:**

- Create: `scripts/KicadBaselineMappingCatalog.mjs`
- Modify: `scripts/capture-api-baseline.mjs`
- Modify: `tests/conformance/convergence-baselines.test.mjs`

**Interfaces:**

- Produces: `KicadBaselineMappingCatalog.owner(owner)`, `.capability(id)`, and `.parity(id)` records with explicit `capabilityId`, `disposition`, replacement, availability, and reason.

- [ ] Add tests proving `PcbInteractionIndex` is shared, S-expression owners are native extensions using `s_expression_parser`, and KiCad scene adapters are native while canonical scene facades are shared.
- [ ] Run the focused test and confirm current token-similarity assignments fail.
- [ ] Add complete explicit owner/capability/parity catalogs; reject missing or stale catalog entries.
- [ ] Remove `snakeCase`, `capabilityFor`, and inferred disposition logic.
- [ ] Regenerate artifacts and verify representative rows plus complete catalog coverage.

### Task 2: Capture complete callable and worker contracts

**Files:**

- Create: `scripts/KicadApiContractInspector.mjs`
- Modify: `scripts/capture-api-baseline.mjs`
- Modify: `tests/conformance/convergence-baselines.test.mjs`

**Interfaces:**

- Produces: `KicadApiContractInspector.entrypoint(...)`, `.callable(...)`, and `.workerProtocol(source)` contracts used identically by capture and strict checks.

- [ ] Add tests requiring `PcbInteractionIndex.hitTestItems` options `hiddenLayers`, `hiddenObjects`, `side`, and `tolerance`.
- [ ] Add tests requiring nested documented result paths such as `sizeMil.width`, `sizeMil.depth`, and `sizeMil.height`.
- [ ] Add tests requiring request fields `type`, `requestId`, `fileName`, `buffer`, `options` and response fields for both success and error messages.
- [ ] Run focused tests and confirm current capture omits these contracts.
- [ ] Implement optional-chain parsing, recursive internal delegation, JSDoc object-shape parsing, and worker request/response extraction.
- [ ] Regenerate and verify the exact captured rows.

### Task 3: Validate full packed drift in strict mode

**Files:**

- Modify: `scripts/check-feature-preservation.mjs`
- Modify: `tests/conformance/feature-preservation-check.test.mjs`

**Interfaces:**

- Strict validation consumes packed entrypoints and compares complete callable arrays, capability inventory, parity inventory, and worker protocol to the baseline.

- [ ] Add a real packed-package negative test that tampers a static method signature/options/result shape in a non-empty entrypoint.
- [ ] Add packed negative tests that tamper complete capability and parity rows.
- [ ] Run focused tests and confirm current strict validation accepts the tampering.
- [ ] Reuse `KicadApiContractInspector` for actual packed contracts and deep-compare all captured callable fields.
- [ ] Deep-compare complete `KicadToolkitCapabilities.inventory()` and `KicadFeatureParity.inventory()` results.
- [ ] Verify packed worker protocol against the captured request/response contract.

### Task 4: Reproduce the baseline from clean HEAD

**Files:**

- Modify: `scripts/capture-api-baseline.mjs`
- Modify: `tests/conformance/convergence-baselines.test.mjs`

**Interfaces:**

- Capture extracts the fixed Git ref to a temporary baseline tree, reflects that tree, validates its tree hash/package identity, writes to the active output tree, and removes the temporary tree.

- [ ] Add a test requiring the baseline's original `project folder is named kicad-toolkit` definition and rejecting the later checkout-independent name from baseline provenance.
- [ ] Add a subprocess test proving capture succeeds from current committed HEAD.
- [ ] Run focused tests and confirm provenance/capture failures.
- [ ] Implement temporary Git archive extraction with separate source/output roots and guaranteed cleanup.
- [ ] Regenerate artifacts and run capture again to prove immutable readback.

### Task 5: Keep development baselines out of npm

**Files:**

- Create: `tests/conformance/package-baseline-exclusion.test.mjs`
- Modify: `package.json`

**Interfaces:**

- The npm package includes `spec/library-scope.md` explicitly, excludes API/ledger/benchmark development baselines, and stays below 3 MB unpacked and 550 KB compressed at Task 1.

- [ ] Add npm dry-run assertions for excluded paths, retained scope documentation, and size ceilings.
- [ ] Run the focused test and confirm the current 11.8 MB package fails.
- [ ] Replace broad `spec` inclusion with `spec/library-scope.md`.
- [ ] Verify npm dry-run layout and size.

### Task 6: Regenerate, verify, and commit

**Files:**

- Regenerate: `spec/api-baseline-v1.0.29.json`
- Regenerate: `spec/feature-preservation.json`
- Update: `.superpowers/sdd/task-1-report.md` (untracked)

- [ ] Run focused conformance, strict packed validation, clean-HEAD capture readback, benchmark readback, full `npm test`, format, diff, line-size, and npm-pack gates.
- [ ] Review staged files for Task 1 scope only.
- [ ] Commit with a concise `fix:` message and preserve the worktree for parent review.
