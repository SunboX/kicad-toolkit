# KiCad convergence Task 1 report

Status: REMEDIATED AFTER FRESH REJECTION — ready for a different independent review; remediation is intentionally uncommitted

Commits:

- `db5bd6c0045b5957e453f8b00ccaa15b599a92a1` (`chore: record KiCad convergence baselines`)
- `53794d84b1da4e1074e92b2d31d180dae5117845` (`fix: harden KiCad convergence baselines`)
- `281ace1c346301e426f2a1d648b05b8d9d97cb13` (`fix: validate KiCad wrapper and package contracts`)

Branch/worktree: `codex/api-convergence-20260710` in `/Users/afiedler/Documents/privat/Andrés_Werkstatt/kicad-toolkit-api-convergence`; preserved as requested. The original worktree was not touched.

## Delivered

- Immutable API baseline for `kicad-toolkit@1.0.29` / `c71c88d69d236accce123656dfa66914c0d5489c`.
- Exhaustive 9,020-row API and preservation contract covering all eight package entrypoints, 126 root exports, methods, lexically resolved arguments/options, method-scope result shapes, accessor values/types, stylesheet behavior, all worker request/response fields, 74 capabilities, 75 parity features, and the 382-test source baseline.
- Explicit audited preservation catalog for exactly 135 public owners, 74 capabilities, and 75 parity features. There is no similarity or fallback mapping.
- One shared API contract inspector drives both capture and strict validation. Acorn-backed lexical analysis ignores comments/strings and shadowed bindings, models block/catch/function scopes and reachable control flow, distinguishes invoked synchronous callbacks from uncalled closures, follows exact imported/local symbols without same-name unions, respects overridden spread fields, resolves bound delegated results and source-visible private methods, and captures JSDoc shapes.
- Static accessors now freeze bounded deep runtime values plus documented return types; setters freeze their parameter and JSDoc type, while instance accessors remain side-effect free and are not invoked.
- Public CSS assets now freeze both a SHA-256 digest and normalized selector/declaration rules, and strict packed validation rejects asset-content drift.
- Generated JSON baselines are covered by `REUSE.toml`; the obsolete parallel `.reuse/dep5` configuration is removed, and the complete repository passes REUSE 3.3 lint.
- Strict ledger validation for missing, duplicate, stale, fictitious, incomplete, wrong-package, mapping, source-contract, repository-confined evidence paths, full packed callable contracts, complete capability/parity inventories, worker protocol, package identity, package export-map checksum/inventory, and packed-entrypoint drift. Strict mode also authenticates pinned parsed-artifact identities for the complete baseline and ledger, so custom or recomputed feature rows cannot become their own trust root.
- Reproducible capture extracts the fixed `c71c88d69d236accce123656dfa66914c0d5489c` Git archive outside the repository in the operating-system temporary directory, shares dependencies through an isolated symlink, and atomically renames then removes the extraction tree.
- Development API/ledger/benchmark baselines are excluded from npm; `spec/library-scope.md` remains shipped.
- Deterministic synthetic parse/project/report/render/query/interaction/worker-clone benchmark fixtures and six immutable cases. Fixed primaries are `parse.large-board`, `render.multi-layer`, and `worker.clone`. Historical readback is pinned by a whole-artifact checksum and independent per-case result/measurement anchors; ordinary `npm run benchmark` measures current HEAD and applies real median-regression gates.
- Package scripts: `capture:api`, `check:features`, and `benchmark`.
- Structural checkout-independent repair for the pre-existing package-root test.

## TDD evidence

- Baseline suite before Task 1: 381/382 passing; sole failure was the project-structure assertion hard-coding the checkout basename `kicad-toolkit`.
- Initial convergence baseline test: RED with `ENOENT` for `spec/api-baseline-v1.0.29.json`.
- Initial preservation checker test: RED with module-not-found for `scripts/check-feature-preservation.mjs`.
- Source-contract mismatch regression: RED with `Missing expected rejection`; GREEN after adding `sourceContract` to complete/exact mapping validation.
- Audited mapping regression: RED showed `PcbInteractionIndex` as `kicad_pcb_parser` / `native-extension`; GREEN maps it to shared `geometry_helpers`, maps all S-expression owners to native `s_expression_parser`, and separates native KiCad scene adapters from shared scene facades.
- Exhaustive callable regression: RED showed `PcbInteractionIndex.hitTestItems.options` as `[]`; GREEN captures `hiddenLayers`, `hiddenObjects`, `side`, and `tolerance`, delegated callers, documented `sizeMil.*` result paths, and documented `args` fields.
- Worker regression: RED showed no `workerProtocol`; GREEN captures five `parse:file` request fields and three fields for each success/error response.
- Packed strict regression: RED accepted a drifted real packed static method; GREEN independently rejects signature, arity, parameter, option, result-field, instance-method, capability-row, parity-row, and worker-protocol drift.
- Provenance regression: RED showed the later checkout-independent test name in the `c71c88d...` baseline and capture failed from `db5bd6c...`; GREEN records only the fixed source tree and reproduces from the active HEAD.
- Package regression: RED measured 718,903 bytes compressed / 11,798,124 bytes unpacked with both development JSON files shipped; GREEN excludes them.
- Standalone wrapper regression: RED captured no options or result fields for `preparePcbSideResolvedRenderModel`; GREEN follows `PcbSideResolvedRenderModel.resolve` across the public export boundary and freezes `side` plus all 19 result paths in both `.` and `./renderers` (40 new wrapper rows total).
- Package-manifest regression: RED accepted a baseline checksum replaced with 64 zeroes; GREEN validates the checksum against the captured export map before packed imports.
- Packed export-map regressions: RED strict validation ignored packed `package.json`; GREEN independently rejects remapping `./renderers` and removing `./scene3d`, while cross-checking all eight captured entrypoints.
- Lexical option regression: RED treated comments, strings, a shadowed `options` loop binding, and a nested call result as caller options; GREEN captures only the truly forwarded `variables` field. The real `KicadParser.parseArrayBufferToRendererModel` contract now exposes `variables` and excludes router-overridden `fileName` plus transformed board fields.
- Result-flow regression: RED scanned callback returns and string content while missing a bound object returned through a wrapper; GREEN captures only `kind`, `summary`, and `summary.count` for the synthetic probe and captures the actual `KicadParser.wrapBoard` envelope without `componentIndex`.
- Accessor regression: RED produced identical contracts for getters with different observable values; GREEN captures documented types and safe static values.
- Stylesheet regression: RED accepted a packed `.pcb-svg { display: none; }` mutation; GREEN rejects it as `Packed asset contract differs`.
- REUSE regression: RED found both `REUSE.toml` and `.reuse/dep5` and no annotations for generated JSON; GREEN uses one configuration and reports 369/369 files with copyright and license information.
- Latest lexical-scope rejection: RED captured `afterReturn`, `catchOnly`, `closureOnly`, and `unreachable` while missing destructured `project` and `variables`; GREEN records only reachable destructuring, direct calls, declared calls, and synchronous Array callbacks while excluding catch shadows, false branches, post-return code, and uncalled closures.
- Latest result-flow rejection: RED captured `afterReturn`, `shadowOnly`, and `unreachable`; GREEN records only `called` and the correctly preserved outer binding, excludes opaque `JSON.stringify` argument objects, and does not let block shadows overwrite outer state.
- Latest delegation rejection: RED accepted a same-method-name decoy from executable-looking strings/comments and lost a private-helper result; GREEN resolves exact module imports, aliases, local shadows, bound return provenance, and source-visible private methods through AST/scope symbols only. The real standalone side wrapper now freezes all 25 reachable result paths, including six nested `pcb.kicadBoard.*` paths.
- Latest accessor rejection: RED froze only shallow getter keys and omitted the setter; GREEN records the bounded deep getter value plus `{ parameter, parameterType }` from the setter AST/JSDoc.
- Real callback integration regression: the first post-remediation recapture dropped `hiddenLayers` and `hiddenObjects` because callback bodies were treated as uncalled closures; a new RED callback adversary reproduced it, and GREEN distinguishes synchronous Array iteration callbacks from genuinely uncalled closures. `PcbInteractionIndex.hitTest`, `hitTestItems`, and `pick` again expose all four exact options.
- Switch/logical option-flow rejection: RED missed all reachable switch cases and captured the right operands of `false &&`, `true ||`, and non-nullish `??`; GREEN interprets literal selection, unknown-case fallthrough, `break`/return completion, and logical short-circuit reachability.
- Callback-provenance rejection: RED missed a callback passed through and invoked by an arbitrary local helper while falsely executing a callback passed to an unrelated object method named `map`; GREEN propagates callable values through parameters and object members and applies Array intrinsics only to structurally proven arrays.
- Live Array callback preservation: the first structural Array fix correctly rejected fake `map` calls but reduced the baseline to 9,016 rows by losing four real `rotation` reads through `(components || []).map(...)`; an exact RED documented-Array regression led to JSDoc Array provenance plus logical-fallback propagation, restoring all 9,020 approved rows without reintroducing fake method-name behavior.
- Result completion rejection: RED unioned constant-dead logical and switch values and retained a `try` return overridden by a returning `finally`; GREEN uses literal-aware logical evaluation, selected-case fallthrough, typed abrupt completions, and finalizer override/preservation semantics.
- Fresh local switch rejection: RED continued evaluating later case labels, bodies, and `default` after an earlier guaranteed match, so a selected `return null` was masked by dead exact-result contracts; GREEN computes source-ordered possible starts, stops label evaluation at a guaranteed match, and models fallthrough, `break`, and abrupt completion without leaking dead branches.
- Fresh imported-delegate rejection: RED traversed the right side of literal-dead `&&`, `||`, and `??`, independently unioned every switch case, skipped side-effect-only finalizers, and retained pending returns overridden by `finally`; GREEN applies the same literal logical and switch plan transitively across imported delegates and executes every finalizer, with abrupt finalizer completions overriding pending returns and normal finalizers contributing reachable options.
- Strict equal-contract bypass regression: RED produced identical baseline/drift contracts when the selected branch changed from an imported exact result to `null` because a dead `default` supplied the same result; GREEN preserves the selected-case difference in both local and imported-delegate probes.
- Benchmark readback rejection: RED accepted changed package identity, fixture structure/checksum, and case-contract checksum after recomputing only the outer report checksum; GREEN independently derives and validates all three contracts from package constants, `KicadBenchmarkFixtureFactory`, and `KicadConvergenceBenchmark.cases()`.
- Worker protocol rejection: RED interpreted message-like comments and strings as request fields/types and response objects; GREEN parses executable Acorn syntax with lexical parameter bindings, discriminator comparisons, optional/fallback field semantics, and real returned object expressions.
- Fresh local completion rejection: RED leaked `ghostAfterTry` after pending `break`, `continue`, and `return` completions passed through a normally completing `finally`, and entered non-throwing catches in both local analyzers. GREEN uses normal states plus typed `return`, `throw`, `break`, and `continue` completions; normal finalizers restore pending abrupt flow, abrupt finalizers replace it, calls contribute possible throws, and catches consume only those throws while preserving all 9,020 source-derived rows.
- Fresh evidence rejection: RED accepted a fabricated `.#FakeOwner.ghost.option` after the caller recomputed its self-seal and placed `FakeOwner` in an unused literal or local alias. GREEN uses 8,871 packed-contract rows plus 149 exact inventory-contract rows under pinned whole-baseline (`15444cd9…`) and whole-ledger (`279e5017…`) parsed identities; every behavior row is deep-compared with its exact live capability/parity record.
- Fresh benchmark-integrity rejection: RED accepted zero measurements, billion-millisecond samples, fabricated results, and copied baseline measurements after local checksums were recomputed. GREEN authenticates the complete historical artifact (`ccfcc289…`), exact deterministic case results, positive bounded samples/clone/heap data, exact sample-count/median semantics, and rejects reused historical measurements.
- Candidate benchmark rejection: RED `npm run benchmark` exited at current HEAD because recording required the historical commit. GREEN keeps `--record benchmarks/baseline-v1.0.29.json` pinned while ordinary execution measures `281ace1c…`, compares all six cases, and fails the command on a release-threshold regression.

## Final gates

- `npm run capture:api`: PASS and immutable readback, 9,020 features across eight entrypoints.
- `node --expose-gc scripts/run-benchmarks.mjs --record benchmarks/baseline-v1.0.29.json`: PASS immutable readback; six cases; report checksum `15d2264e0f45cbd779346f28bc3ee9025c03f4c0495193281db44dfa1cd6c55f`.
- `npm run check:features`: PASS, 9,020 mappings.
- `npm run check:features -- --strict`: PASS, 9,020 mappings against the packed manifest, callables, CSS asset, complete inventories, worker source, and evidence.
- Focused external-style completion, fabricated-provenance, immutable-benchmark, and current-comparison adversaries: PASS; combined inspector/convergence/feature-preservation focus exits 0.
- `npm test`: PASS, 424 test definitions, no skip/todo definitions.
- `npm pack --json --dry-run`: PASS, 463,276 bytes compressed, 2,527,300 bytes unpacked, 264 entries; only `spec/library-scope.md` from `spec/`, with no development baselines.
- `npm run check:format`: PASS.
- `uvx --from 'reuse[charset-normalizer]' reuse lint`: PASS, 383/383 files covered.
- `git diff --check`: PASS.
- JSDoc/manual review: PASS for all named new functions and methods.
- File-size review: PASS; `scripts/KicadResultContractAnalyzer.mjs` is 970 lines, `scripts/KicadOptionContractAnalyzer.mjs` is 780 lines, the typed option executor is 544 lines, and the focused inspector regression file is 981 lines; all remain below 1,000.

## Concerns and handoff notes

- The exhaustive development API and ledger JSON files are intentionally large (about 13.8 MB uncompressed combined) because every public contract row carries its evidence and migration decision; they no longer affect the npm package.
- Later convergence tasks should consume the immutable baseline. Re-running capture is safe from later commits because source data always comes from the fixed Git archive.
- Recorded timing and heap observations remain environment-specific, but current execution now has positive/bounded integrity checks and explicit candidate-to-historical thresholds. The latest current comparison passed all six cases; primary ratios were `0.945546` (parse), `1.090468` (render), and `1.008304` (worker clone), each below the `1.25` release limit.
- No remediation commit was created. The worktree is ready for a different reviewer, as requested.
