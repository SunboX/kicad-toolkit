# KiCad Task 1 Third-Review Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:test-driven-development` and execute each task RED-first. This
> remediation stays uncommitted and requires a different final reviewer.

**Goal:** Make local and delegated contract analysis follow ECMAScript literal
logical, switch, and try/catch/finally completion semantics so dead source
cannot preserve a drifted strict contract.

**Architecture:** Local option and result analyzers will derive switch paths by
scanning case tests in source order and stopping once an earlier literal match
is guaranteed. The delegated analyzer will replace its boolean
`{ reachable, returns }` outcome with normal states plus typed abrupt
completions, then apply the same literal switch/logical rules and run every
finalizer against normal and pending abrupt paths.

**Tech Stack:** Node.js 20+, ESM, Acorn AST, `node:test`, npm pack, REUSE 3.3.

## Global Constraints

- Preserve exactly 9,020 API/preservation rows unless source evidence proves a
  correction.
- Preserve all callback, documented-Array, worker, and benchmark remediations.
- Keep every JavaScript file below 1,000 lines with JSDoc on named functions
  and methods.
- Do not commit, pin, or self-accept this candidate.

---

### Task 1: Prove local switch reachability failures

**Files:**

- Modify: `tests/conformance/api-contract-inspector.test.mjs`
- Modify: `scripts/KicadOptionControlFlow.mjs`
- Modify: `scripts/KicadResultContractAnalyzer.mjs`

**Interfaces:**

- Consumes: literal values from the existing local AST analyzers.
- Produces: ordered possible switch starts, reachable case-test indexes, and a
  no-match path.

- [ ] Add a probe whose first matching case breaks or returns `null`, followed
      by an option-backed case label/body and default that must stay dead.
- [ ] Add fallthrough coverage proving selected later bodies execute until an
      unlabeled break while return/throw remain abrupt.
- [ ] Add baseline/drift probes that currently capture equal contracts only
      because dead later cases mask a live selected-case change to `null`.
- [ ] Run the focused inspector test and verify RED on the leaked option/result
      fields and equal-contract assertion.
- [ ] Implement source-ordered switch planning and use it in both local
      analyzers without weakening unknown-case conservatism.
- [ ] Re-run the focused test and verify GREEN.

### Task 2: Prove delegated completion failures

**Files:**

- Modify: `tests/conformance/fixtures/DelegateWrapperProbe.mjs`
- Create: `tests/conformance/fixtures/DelegateStrictBaselineProbe.mjs`
- Create: `tests/conformance/fixtures/DelegateStrictDriftProbe.mjs`
- Modify: `tests/conformance/api-contract-inspector.test.mjs`
- Modify: `scripts/KicadDelegatedCallAnalyzer.mjs`

**Interfaces:**

- Consumes: exact module/runtime symbols from
  `KicadModuleContractRegistry`.
- Produces: normal delegated states and typed `return`, `throw`, `break`, and
  `continue` completions carrying exact returned provenance.

- [ ] Add exact imported-delegate probes for `false && delegate()`, a selected
      switch case with dead default, a returning finalizer overriding a pending
      delegate return, and a side-effect-only finalizer preserving the pending
      return while contributing options.
- [ ] Add separate imported baseline/drift fixtures whose contracts are
      currently equal only because a dead default masks selected-case `null`.
- [ ] Run the focused inspector test and verify each regression is RED for the
      supplied semantic reason.
- [ ] Add literal abstract values and logical right-operand decisions to the
      delegated evaluator.
- [ ] Execute switch labels in source order, selected-case fallthrough, and
      consume only unlabeled switch breaks.
- [ ] Execute catches only for pending throws and execute finalizers for every
      normal or abrupt path; finalizer abrupt completions override pending ones,
      while normal finalizers restore the pending completion.
- [ ] Re-run focused tests and verify GREEN without broadening same-name
      delegation.

### Task 3: Regenerate and verify immutable contracts

**Files:**

- Regenerate: `spec/api-baseline-v1.0.29.json`
- Regenerate: `spec/feature-preservation.json` only if capture requires it.
- Update: `.superpowers/sdd/task-1-report.md`

**Interfaces:**

- Consumes: corrected contract inspector output.
- Produces: immutable 9,020-row capture and final independent-review evidence.

- [ ] Run `npm run capture:api` and prove immutable readback.
- [ ] Run ordinary and strict feature preservation; require exactly 9,020.
- [ ] Run focused conformance, full tests (at least 414), benchmark immutable
      readback, npm dry-run pack, formatting, REUSE lint, diff check, and file
      caps.
- [ ] Update the ignored Task 1 report with exact fresh counts/checksums.
- [ ] Leave the worktree uncommitted and hand it to a different reviewer.
