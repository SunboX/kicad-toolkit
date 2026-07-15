# kicad-toolkit 1.3.1

Version 1.3.1 restores complete SMD pad geometry on both PCB faces at the
canonical CircuitJSON boundary. Shared renderers and 3D viewers can consume the
parser result directly without a KiCad-specific adapter or application-side
workaround.

## Face-specific pad projection

- Bottom SMD pads now emit `layer: 'bottom'`; top pads remain on `top`.
- Width, height, shape, rounded-corner radius, and exact right-angle rotation
  come from the resolved copper face instead of always reading the top face.
- Active-face offsets rotate with the source pad and are folded into canonical
  pad and port coordinates.
- Bottom-only pads no longer fall through to raw KiCad millimeter fields and
  accidentally reinterpret those values as mils.
- The renderer compatibility model now names top, inner, and bottom pad shapes
  and exposes corner-radius values for every represented face.

## CircuitJSON behavior

- SMD pad and PCB-port layers are emitted from one shared active-face decision.
- KiCad mask-layer participation, explicit tenting, and local mask expansion
  now project to `is_covered_with_solder_mask` and `soldermask_margin`.
- PCB pads and ports reference the already-created designator-based
  `pcb_component_id`, eliminating dangling numeric owner references.
- Parser parameters and document return envelopes are unchanged. The added
  face-specific compatibility properties are additive.

## Verification

- A source-neutral bottom-pad regression covers side, non-square dimensions,
  rounded corners, rotation, a nonzero face offset, mask state, mask margin,
  port layers, and component ownership.
- The complete package suite passes with 478 tests.
- The package formatting gate and npm dry-run are part of the release gate.
