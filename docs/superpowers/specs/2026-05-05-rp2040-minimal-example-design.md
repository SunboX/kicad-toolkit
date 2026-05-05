# RP2040 Minimal Design Example

## Context

The user requested a browser example similar to the Altium Toolkit Arduino Uno
example, but based on Tommy Gilligan's public RP2040 Minimal Design project.

The upstream project is available at
`https://github.com/tommy-gilligan/RP2040-minimal-design`. Its board file is
`RP2040_minimal.kicad_pcb`, and the upstream license is BSD 3-Clause. The board
parses and renders successfully with the current toolkit.

## Decision

Create a new `examples/rp2040-minimal-design/` browser example that fetches the
upstream board file from GitHub at runtime. Do not vendor the upstream board file
into this repository.

This keeps the example close to the Altium Toolkit Arduino Uno pattern: the
example credits the source project, loads public source material from GitHub,
and demonstrates the toolkit against a real-world board without redistributing
the third-party KiCad design file.

## User Experience

The example page will show a compact application shell with source attribution,
a status area, and front/back side controls. On load, it will fetch
`RP2040_minimal.kicad_pcb` from `raw.githubusercontent.com`, parse the board, and
render the selected side as deterministic SVG.

If the GitHub fetch fails, the page will show a clear error state. The page will
not add host application concerns such as drag/drop orchestration, persistent
DOM state, download UI, or app-shell integrations beyond the browser example
itself.

## Components

- `examples/rp2040-minimal-design/index.html` will define the example page,
  import map for `fflate`, source credit, status text, controls, and output
  mount.
- `examples/rp2040-minimal-design/example.mjs` will fetch the source board,
  parse it with `KicadPcbParser`, and render front/back views with
  `PcbSvgRenderer`.
- `examples/rp2040-minimal-design/styles.css` will style the example with a
  restrained PCB viewer layout consistent with the existing examples.
- `examples/README.md` will list the RP2040 example URL.
- `tests/project-structure.test.mjs` will verify the new example files exist.
  A focused test will also check that the example references the credited source
  repository and raw board URL.

## Data Flow

1. Browser loads `/examples/rp2040-minimal-design/`.
2. `example.mjs` fetches the upstream raw `.kicad_pcb` file.
3. The response text is parsed through `KicadPcbParser.parse`.
4. `PcbSvgRenderer.render(board, { side })` produces SVG for the selected side.
5. Side controls re-render the existing parsed board without another fetch.

## Error Handling

The controller will set status states for loading, ready, and error. Non-OK HTTP
responses will include the HTTP status in the error message. Parse failures will
be displayed as plain text in an error panel.

## Testing

Tests will stay local and deterministic. They will not fetch GitHub content.
They will assert the example files exist and that the example source contains
the intended credited source project URL and raw board URL. Full verification
will use `npm test`.
