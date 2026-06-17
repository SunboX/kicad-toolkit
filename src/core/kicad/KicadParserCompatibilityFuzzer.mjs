// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadJobsetParser } from './KicadJobsetParser.mjs'
import { KicadParser } from './KicadParser.mjs'
import { KicadProjectMetadataParser } from './KicadProjectMetadataParser.mjs'

const schemaId = 'kicad-toolkit.parser-compatibility-fuzz.a1'

/**
 * Runs deterministic parser smoke cases against KiCad parser entrypoints.
 */
export class KicadParserCompatibilityFuzzer {
    /**
     * Runs all built-in synthetic parser compatibility cases.
     * @returns {object}
     */
    static run() {
        const cases = builtInCases().map(runCase)
        return {
            schema: schemaId,
            summary: {
                caseCount: cases.length,
                failureCount: cases.filter((entry) => entry.status === 'fail')
                    .length,
                diagnosticCount: cases.reduce(
                    (total, entry) =>
                        total + Number(entry.diagnosticCount || 0),
                    0
                )
            },
            cases
        }
    }
}

/**
 * Lists deterministic compatibility cases.
 * @returns {{ key: string, parse: () => object }[]}
 */
function builtInCases() {
    return [
        {
            key: 'schematic-empty',
            parse: () =>
                KicadParser.parseArrayBufferToRendererModel(
                    'fuzz-empty.kicad_sch',
                    encodeText('(kicad_sch (version 20250114))')
                )
        },
        {
            key: 'pcb-minimal',
            parse: () =>
                KicadParser.parseArrayBufferToRendererModel(
                    'fuzz-minimal.kicad_pcb',
                    encodeText(minimalPcbSource())
                )
        },
        {
            key: 'pcb-geometry-edge-cases',
            parse: () =>
                KicadParser.parseArrayBufferToRendererModel(
                    'fuzz-geometry.kicad_pcb',
                    encodeText(geometryEdgeCasePcbSource())
                )
        },
        {
            key: 'project-metadata-sparse',
            parse: () =>
                KicadProjectMetadataParser.parse(
                    '{"meta":{"filename":"fuzz.kicad_pro"}}',
                    { fileName: 'fuzz.kicad_pro' }
                )
        },
        {
            key: 'jobset-empty',
            parse: () =>
                KicadJobsetParser.parse('{"jobs":[],"outputs":[]}', {
                    fileName: 'fuzz.kicad_jobset'
                })
        }
    ]
}

/**
 * Executes one compatibility case.
 * @param {{ key: string, parse: () => object }} entry Case descriptor.
 * @returns {object}
 */
function runCase(entry) {
    try {
        const model = entry.parse()
        return {
            key: entry.key,
            status: 'pass',
            kind: model?.kind || '',
            fileType: model?.fileType || '',
            diagnosticCount: (model?.diagnostics || []).length,
            summary: stableSummary(model?.summary || {})
        }
    } catch (error) {
        return {
            key: entry.key,
            status: 'fail',
            diagnosticCount: 1,
            error: {
                name: error?.name || 'Error',
                message: error?.message || String(error)
            }
        }
    }
}

/**
 * Builds a compact stable summary.
 * @param {object} summary Parser summary.
 * @returns {object}
 */
function stableSummary(summary) {
    return Object.fromEntries(
        Object.entries(summary || {}).filter(([, value]) =>
            ['number', 'string', 'boolean'].includes(typeof value)
        )
    )
}

/**
 * Builds a compact PCB with geometry edge cases.
 * @returns {string}
 */
function geometryEdgeCasePcbSource() {
    return `(kicad_pcb
        (version 20241229)
        (layers
            (0 "F.Cu" signal)
            (31 "B.Cu" signal)
            (37 "F.SilkS" user)
            (44 "Edge.Cuts" user)
            (47 "Dwgs.User" user)
        )
        (net 0 "")
        (net 1 "GND")
        (arc
            (start 1 0)
            (mid 1.5 0.5)
            (end 2 0)
            (width 2)
            (layer "F.Cu")
            (net 1)
        )
        (gr_curve
            (pts
                (xy 0 0)
                (xy 0.5 0.8)
                (xy 1.5 -0.8)
                (xy 2 0)
            )
            (stroke (width 0.15) (type solid))
            (layer "F.SilkS")
        )
        (dimension
            (type aligned)
            (layer "Dwgs.User")
            (pts (xy 0 0) (xy 5 0))
            (gr_text "5 mm" (at 2.5 -1 0) (layer "Dwgs.User"))
        )
        (footprint "Test:GEOM"
            (layer "F.Cu")
            (at 4 4 0)
            (property "Reference" "U1" (at 0 0 0))
            (property "Value" "GEOM" (at 0 1 0))
            (pad "1" smd roundrect
                (at 0 0)
                (size 1 1)
                (roundrect_rratio 0.25)
                (layers "F.Cu" "F.Paste" "F.Mask")
            )
            (pad "2" smd custom
                (at 2 0)
                (size 1 1)
                (layers "F.Cu")
                (options (clearance outline) (anchor rect))
                (primitives
                    (gr_curve
                        (pts
                            (xy -0.5 0)
                            (xy -0.25 0.5)
                            (xy 0.25 -0.5)
                            (xy 0.5 0)
                        )
                        (stroke (width 0.1) (type solid))
                        (fill no)
                    )
                )
            )
        )
    )`
}

/**
 * Encodes text as an ArrayBuffer.
 * @param {string} source Source text.
 * @returns {ArrayBuffer}
 */
function encodeText(source) {
    const bytes = new TextEncoder().encode(source)
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)
}

/**
 * Builds a compact KiCad PCB source.
 * @returns {string}
 */
function minimalPcbSource() {
    return `(kicad_pcb
        (version 20241229)
        (layers
            (0 "F.Cu" signal)
            (31 "B.Cu" signal)
            (32 "B.Adhes" user "B.Adhesive")
            (44 "Edge.Cuts" user)
        )
        (gr_line
            (start 0 0)
            (end 10 0)
            (stroke (width 0.15) (type solid))
            (layer "Edge.Cuts")
        )
        (gr_line
            (start 10 0)
            (end 10 10)
            (stroke (width 0.15) (type solid))
            (layer "Edge.Cuts")
        )
        (gr_line
            (start 10 10)
            (end 0 10)
            (stroke (width 0.15) (type solid))
            (layer "Edge.Cuts")
        )
        (gr_line
            (start 0 10)
            (end 0 0)
            (stroke (width 0.15) (type solid))
            (layer "Edge.Cuts")
        )
    )`
}
