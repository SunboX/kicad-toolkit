// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from 'node:crypto'

const DEFAULT_FOOTPRINTS = 96
const DEFAULT_SEGMENTS = 384

/**
 * Builds deterministic synthetic KiCad benchmark inputs.
 */
export class KicadBenchmarkFixtureFactory {
    /**
     * Builds a deterministic large synthetic board source.
     * @param {{ footprintCount?: number, segmentCount?: number }} [options] Fixture sizing.
     * @returns {string} KiCad PCB source.
     */
    static largeBoardSource(options = {}) {
        const footprintCount = Number.isInteger(options.footprintCount)
            ? options.footprintCount
            : DEFAULT_FOOTPRINTS
        const segmentCount = Number.isInteger(options.segmentCount)
            ? options.segmentCount
            : DEFAULT_SEGMENTS
        const footprints = Array.from({ length: footprintCount }, (_, index) =>
            KicadBenchmarkFixtureFactory.#footprint(index)
        ).join('\n')
        const segments = Array.from({ length: segmentCount }, (_, index) =>
            KicadBenchmarkFixtureFactory.#segment(index)
        ).join('\n')

        return `(kicad_pcb
    (version 20241229)
    (generator "kicad-toolkit-benchmark")
    (general (thickness 1.6))
    (title_block (title "Synthetic convergence board"))
    (layers
        (0 "F.Cu" signal)
        (31 "B.Cu" signal)
        (36 "B.SilkS" user "b.silkscreen")
        (37 "F.SilkS" user "f.silkscreen")
        (44 "Edge.Cuts" user)
    )
    (setup (pad_to_mask_clearance 0))
    (net 0 "")
    (net 1 "GND")
    (net 2 "SIGNAL_A")
    (gr_rect
        (start 0 0)
        (end 160 100)
        (stroke (width 0.15) (type solid))
        (fill none)
        (layer "Edge.Cuts")
    )
    (gr_text "SYNTHETIC"
        (at 80 4 0)
        (layer "F.SilkS")
        (effects (font (size 1.5 1.5) (thickness 0.2)))
    )
${footprints}
${segments}
)`
    }

    /**
     * Encodes the large board source as canonical UTF-8 input.
     * @param {Record<string, number>} [options] Fixture sizing.
     * @returns {Uint8Array} Board bytes.
     */
    static largeBoardBytes(options = {}) {
        return new TextEncoder().encode(
            KicadBenchmarkFixtureFactory.largeBoardSource(options)
        )
    }

    /**
     * Builds deterministic project entries with two boards and metadata.
     * @returns {{ name: string, bytes: Uint8Array }[]} Project entries.
     */
    static projectEntries() {
        const primary = KicadBenchmarkFixtureFactory.largeBoardBytes({
            footprintCount: 48,
            segmentCount: 192
        })
        const secondary = KicadBenchmarkFixtureFactory.largeBoardBytes({
            footprintCount: 24,
            segmentCount: 96
        })
        return [
            { name: 'synthetic-main.kicad_pcb', bytes: primary },
            { name: 'synthetic-panel.kicad_pcb', bytes: secondary },
            {
                name: 'synthetic.kicad_pro',
                bytes: new TextEncoder().encode(
                    JSON.stringify({
                        board: {},
                        boards: [],
                        meta: { filename: 'synthetic.kicad_pro', version: 1 },
                        net_settings: { classes: [], meta: { version: 3 } },
                        text_variables: { PROJECT: 'Synthetic' }
                    })
                )
            },
            {
                name: 'models/synthetic.step',
                bytes: new Uint8Array([83, 84, 69, 80, 10])
            }
        ]
    }

    /**
     * Returns the immutable structural fixture contract and checksum.
     * @returns {Record<string, any>} Fixture manifest.
     */
    static manifest() {
        const source = KicadBenchmarkFixtureFactory.largeBoardSource()
        const project = KicadBenchmarkFixtureFactory.projectEntries()
        const structure = {
            schema: 'kicad-toolkit.benchmark-fixture.v1',
            footprintCount: DEFAULT_FOOTPRINTS,
            segmentCount: DEFAULT_SEGMENTS,
            projectEntryNames: project.map((entry) => entry.name),
            sourceBytes: new TextEncoder().encode(source).byteLength,
            projectBytes: project.reduce(
                (total, entry) => total + entry.bytes.byteLength,
                0
            )
        }
        return Object.freeze({
            ...structure,
            checksum: createHash('sha256')
                .update(JSON.stringify(structure))
                .update(source)
                .update(
                    project
                        .map((entry) =>
                            createHash('sha256')
                                .update(entry.bytes)
                                .digest('hex')
                        )
                        .join(':')
                )
                .digest('hex')
        })
    }

    /**
     * Builds one deterministic synthetic footprint.
     * @param {number} index Footprint index.
     * @returns {string} KiCad footprint source.
     */
    static #footprint(index) {
        const column = index % 12
        const row = Math.floor(index / 12)
        const x = 8 + column * 12
        const y = 12 + row * 10
        const side = index % 5 === 0 ? 'B.Cu' : 'F.Cu'
        const silk = side === 'B.Cu' ? 'B.SilkS' : 'F.SilkS'
        const net = index % 2 === 0 ? '1 "GND"' : '2 "SIGNAL_A"'
        return `    (footprint "Synthetic:Device_${index}"
        (layer "${side}")
        (at ${x} ${y} ${index % 4 === 0 ? 90 : 0})
        (property "Reference" "U${index + 1}"
            (at 0 -2 0)
            (layer "${silk}")
            (effects (font (size 1 1) (thickness 0.15)))
        )
        (property "Value" "SYNTH-${index % 8}"
            (at 0 2 0)
            (layer "F.Fab")
            (effects (font (size 1 1) (thickness 0.15)))
        )
        (fp_rect
            (start -2 -1.5)
            (end 2 1.5)
            (stroke (width 0.15) (type solid))
            (fill none)
            (layer "${silk}")
        )
        (pad "1" smd rect
            (at -1 0 0)
            (size 1.2 1.6)
            (layers "${side}" "F.Mask" "F.Paste")
            (net ${net})
        )
        (pad "2" smd roundrect
            (at 1 0 0)
            (size 1.2 1.6)
            (layers "${side}" "F.Mask" "F.Paste")
            (roundrect_rratio 0.2)
            (net ${net})
        )
    )`
    }

    /**
     * Builds one deterministic routed segment.
     * @param {number} index Segment index.
     * @returns {string} KiCad segment source.
     */
    static #segment(index) {
        const x = 2 + (index % 150)
        const y = 6 + (index % 80)
        const layer = index % 4 === 0 ? 'B.Cu' : 'F.Cu'
        const net = index % 2 === 0 ? 1 : 2
        return `    (segment
        (start ${x} ${y})
        (end ${x + 3} ${y + (index % 3)})
        (width ${index % 3 === 0 ? 0.35 : 0.25})
        (layer "${layer}")
        (net ${net})
    )`
    }
}
