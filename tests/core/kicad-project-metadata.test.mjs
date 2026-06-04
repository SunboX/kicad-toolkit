// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    KicadParser,
    KicadPcbParser,
    KicadProjectMetadataParser
} from '../../src/parser.mjs'

test('KicadProjectMetadataParser exposes KiCad project JSON metadata', () => {
    const metadata = KicadProjectMetadataParser.parse(projectSource(), {
        fileName: 'demo/demo.kicad_pro'
    })

    assert.equal(metadata.kind, 'project-metadata')
    assert.equal(metadata.fileType, 'kicad_pro')
    assert.equal(metadata.sourceFormat, 'kicad')
    assert.deepEqual(metadata.summary, {
        title: 'demo',
        boardCount: 1,
        sheetCount: 1,
        topLevelSheetCount: 1,
        netClassCount: 1,
        ruleCount: 2,
        textVariableCount: 1
    })
    assert.deepEqual(metadata.textVariables, {
        ProjectTitle: 'KiCad Parity'
    })
    assert.deepEqual(metadata.netSettings.classes, [
        {
            name: 'Default',
            clearance: 0.2,
            trackWidth: 0.25,
            viaDiameter: 0.8,
            viaDrill: 0.4,
            nets: ['SIG_A']
        }
    ])
    assert.deepEqual(metadata.board.designSettings.rules, [
        {
            name: 'allow_microvias',
            value: true
        },
        {
            name: 'min_clearance',
            value: 0.2
        }
    ])
})

test('KicadPcbParser exposes board statistics, classes, and rules', () => {
    const board = KicadPcbParser.parse(boardSource(), {
        fileName: 'stats.kicad_pcb'
    })

    assert.deepEqual(board.statistics, {
        footprintCount: 1,
        padCount: 1,
        netCount: 1,
        classCount: 1,
        ruleCount: 2,
        outlineCount: 1,
        drawingCount: 1,
        trackCount: 1,
        arcCount: 0,
        viaCount: 0,
        zoneCount: 0,
        textCount: 3
    })
    assert.deepEqual(board.classes, [
        {
            name: 'Default',
            description: 'fixture class',
            clearance: 0.2,
            traceWidth: 0.25,
            viaDiameter: 0.8,
            viaDrill: 0.4,
            nets: ['GND']
        }
    ])
    assert.deepEqual(board.rules, [
        {
            name: 'min_clearance',
            value: 0.2
        },
        {
            name: 'min_track_width',
            value: 0.15
        }
    ])

    const document = KicadParser.parseArrayBuffer(
        'stats.kicad_pcb',
        bytesFor(boardSource())
    )
    assert.equal(document.summary.classCount, 1)
    assert.equal(document.summary.ruleCount, 2)
    assert.equal(document.pcb.statistics.trackCount, 1)
    assert.deepEqual(document.pcb.classes[0].nets, ['GND'])
})

/**
 * Builds a KiCad project JSON fixture.
 * @returns {string}
 */
function projectSource() {
    return JSON.stringify({
        meta: {
            filename: 'demo.kicad_pro',
            version: 1
        },
        boards: ['demo.kicad_pcb'],
        sheets: [['root', 'demo.kicad_sch']],
        schematic: {
            top_level_sheets: [
                {
                    name: 'Root',
                    filename: 'demo.kicad_sch',
                    uuid: 'root'
                }
            ]
        },
        text_variables: {
            ProjectTitle: 'KiCad Parity'
        },
        net_settings: {
            classes: [
                {
                    name: 'Default',
                    clearance: 0.2,
                    track_width: 0.25,
                    via_diameter: 0.8,
                    via_drill: 0.4,
                    nets: ['SIG_A']
                }
            ],
            meta: {
                version: 0
            }
        },
        board: {
            design_settings: {
                rules: {
                    min_clearance: 0.2,
                    allow_microvias: true
                },
                track_widths: [0.25],
                via_dimensions: [{ diameter: 0.8, drill: 0.4 }]
            }
        }
    })
}

/**
 * Builds a KiCad PCB fixture with project-level classes and setup rules.
 * @returns {string}
 */
function boardSource() {
    return `(kicad_pcb
        (version 20241229)
        (title_block (title "Stats Board"))
        (net 1 "GND")
        (net_class "Default" "fixture class"
            (clearance 0.2)
            (trace_width 0.25)
            (via_dia 0.8)
            (via_drill 0.4)
            (add_net "GND")
        )
        (setup
            (rules
                (min_clearance 0.2)
                (min_track_width 0.15)
            )
        )
        (gr_poly
            (pts (xy 0 0) (xy 10 0) (xy 10 10) (xy 0 10))
            (stroke (width 0.15) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
        (segment
            (start 1 1)
            (end 8 1)
            (width 0.25)
            (layer "F.Cu")
            (net 1)
        )
        (gr_text "BOARD"
            (at 2 4 0)
            (layer "F.SilkS")
            (effects (font (size 1 1) (thickness 0.15)))
        )
        (footprint "Package_SO:SOIC-8"
            (layer "F.Cu")
            (at 5 5 0)
            (property "Reference" "U1"
                (at 0 -2 0)
                (layer "F.SilkS")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (property "Value" "MCU"
                (at 0 2 0)
                (layer "F.Fab")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (pad "1" smd rect
                (at 0 0 0)
                (size 1 1)
                (layers "F.Cu" "F.Mask")
                (net 1 "GND")
            )
        )
    )`
}

/**
 * Encodes fixture text as an ArrayBuffer.
 * @param {string} source Source text.
 * @returns {ArrayBuffer}
 */
function bytesFor(source) {
    const buffer = Buffer.from(source, 'utf8')
    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
    )
}
