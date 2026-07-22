# kicad-toolkit 1.3.2

Version 1.3.2 exposes the shared self-adjusting computation runtime throughout
the ECAD toolkit family while preserving every KiCad parsing and rendering
contract.

## Shared incremental runtime

- The root entrypoint re-exports `SelfAdjustingComputation` from
  `circuitjson-toolkit` 1.4.1.
- The runtime records dynamic data and control dependencies, invalidates only
  changed reader traces, replaces stale branches, and reclaims retired graph
  nodes explicitly.
- Persistent consumers can update mutable input cells and stabilize affected
  computations without rebuilding unrelated derived work.

## Compatibility

- Parser options, immutable document and project envelopes, native extension
  namespaces, renderer output, workers, and service return shapes are
  unchanged.
- The release contains no KiCad-specific incremental special cases; it shares
  the canonical runtime object used by the other toolkits.

## Verification

- API tests prove that the root export is the canonical CircuitJSON runtime.
- Release gates include the complete package suite, formatting, feature
  preservation, benchmark checks, and npm package dry run.
