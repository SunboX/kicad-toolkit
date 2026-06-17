// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { strToU8 } from 'fflate'
import {
    KicadDesignBlockLibraryParser,
    KicadDesignRulesParser,
    KicadFootprintAssociationParser,
    KicadJobsetParser,
    KicadLegacyLibraryParser,
    KicadNetlistParser,
    KicadParser,
    KicadWorksheetParser
} from '../../src/parser.mjs'

test('KicadJobsetParser exposes KiCad output job metadata', () => {
    const model = KicadJobsetParser.parse(jobsetSource(), {
        fileName: 'fabrication.kicad_jobset'
    })

    assert.equal(model.kind, 'jobset')
    assert.equal(model.fileType, 'kicad_jobset')
    assert.deepEqual(model.summary, {
        title: 'fabrication',
        jobCount: 2,
        outputCount: 2
    })
    assert.deepEqual(
        model.jobs.map((job) => ({
            id: job.id,
            type: job.type,
            description: job.description,
            output: job.output
        })),
        [
            {
                id: 'plot-job',
                type: 'pcb_export_gerbers',
                description: 'Plot Gerbers',
                output: 'fab-folder'
            },
            {
                id: 'bom-job',
                type: 'sch_export_bom',
                description: 'BOM',
                output: 'archive'
            }
        ]
    )
    assert.equal(model.outputs[0].settings.output_path, 'fab')
})

test('KicadDesignRulesParser parses custom DRC rules and component classes', () => {
    const model = KicadDesignRulesParser.parse(designRulesSource(), {
        fileName: 'demo.kicad_dru'
    })

    assert.equal(model.kind, 'design-rules')
    assert.equal(model.fileType, 'kicad_dru')
    assert.equal(model.version, 1)
    assert.deepEqual(model.summary, {
        title: 'demo',
        ruleCount: 1,
        constraintCount: 2,
        componentClassAssignmentCount: 1
    })
    assert.deepEqual(model.rules[0], {
        name: 'HV clearance',
        condition: "A.NetClass == 'HV'",
        layer: 'outer',
        severity: 'error',
        constraints: [
            {
                name: 'clearance',
                values: {
                    min: '1mm'
                },
                raw: ['constraint', 'clearance', ['min', '1mm']]
            },
            {
                name: 'track_width',
                values: {
                    min: 0.25,
                    max: 0.6
                },
                raw: ['constraint', 'track_width', ['min', 0.25], ['max', 0.6]]
            }
        ],
        disallow: [],
        rawRule: [
            'rule',
            'HV clearance',
            ['condition', "A.NetClass == 'HV'"],
            ['layer', 'outer'],
            ['severity', 'error'],
            ['constraint', 'clearance', ['min', '1mm']],
            ['constraint', 'track_width', ['min', 0.25], ['max', 0.6]]
        ]
    })
    assert.deepEqual(model.componentClassAssignments, [
        {
            name: 'Power',
            condition: "A.Reference == 'U1'",
            rawAssignment: [
                'assign_component_class',
                'Power',
                ['condition', "A.Reference == 'U1'"]
            ]
        }
    ])
})

test('KicadWorksheetParser parses KiCad page layout worksheets through the facade', () => {
    const model = KicadParser.parseArrayBufferToRendererModel(
        'project.kicad_wks',
        strToU8(worksheetSource())
    )

    assert.equal(model.kind, 'worksheet')
    assert.equal(model.fileType, 'kicad_wks')
    assert.deepEqual(model.summary, {
        title: 'project',
        itemCount: 3,
        textCount: 1,
        lineCount: 1,
        rectangleCount: 1,
        polygonCount: 0,
        bitmapCount: 0
    })
    assert.deepEqual(model.setup, {
        textSize: { width: 1.5, height: 1.5 },
        lineWidth: 0.15,
        textLineWidth: 0.12,
        margins: {
            left: 10,
            right: 10,
            top: 8,
            bottom: 8
        }
    })
    assert.equal(model.texts[0].text, 'Title: ${TITLE}')
    assert.equal(model.lines[0].name, 'border')
    assert.equal(model.rectangles[0].repeat.count, 2)
})

test('KicadNetlistParser parses KiCad exported netlists', () => {
    const model = KicadNetlistParser.parse(netlistSource(), {
        fileName: 'demo.net'
    })

    assert.equal(model.kind, 'netlist')
    assert.equal(model.fileType, 'net')
    assert.deepEqual(model.summary, {
        title: 'demo',
        componentCount: 1,
        netCount: 1,
        nodeCount: 2
    })
    assert.deepEqual(model.components[0], {
        ref: 'R1',
        value: '10k',
        footprint: 'Passives:R_0603',
        lib: 'Device',
        part: 'R',
        properties: {
            Tolerance: '1%'
        },
        rawComponent: [
            'comp',
            ['ref', 'R1'],
            ['value', '10k'],
            ['footprint', 'Passives:R_0603'],
            ['libsource', ['lib', 'Device'], ['part', 'R']],
            ['property', ['name', 'Tolerance'], ['value', '1%']]
        ]
    })
    assert.deepEqual(model.nets[0].nodes, [
        { ref: 'R1', pin: '1' },
        { ref: 'J1', pin: '2' }
    ])
})

test('KicadFootprintAssociationParser parses .cmp footprint association files', () => {
    const model = KicadFootprintAssociationParser.parse(
        footprintAssociationSource(),
        { fileName: 'demo.cmp' }
    )

    assert.equal(model.kind, 'footprint-associations')
    assert.equal(model.fileType, 'cmp')
    assert.deepEqual(model.summary, {
        title: 'demo',
        associationCount: 2
    })
    assert.deepEqual(
        model.associations.map((association) => ({
            ref: association.ref,
            footprint: association.footprint,
            value: association.value
        })),
        [
            {
                ref: 'R1',
                footprint: 'Passives:R_0603',
                value: '10k'
            },
            {
                ref: 'C1',
                footprint: 'Passives:C_0603',
                value: '100n'
            }
        ]
    )
})

test('KicadDesignBlockLibraryParser indexes .kicad_block folders', () => {
    const model = KicadDesignBlockLibraryParser.build([
        {
            name: 'demo/blocks.kicad_blocks/Power.kicad_block/block.json',
            bytes: strToU8(
                JSON.stringify({
                    name: 'Power',
                    description: 'Fake power block',
                    keywords: 'power regulator'
                })
            )
        },
        {
            name: 'demo/blocks.kicad_blocks/Power.kicad_block/Power.kicad_sch',
            bytes: strToU8('(kicad_sch (version 20250114))')
        },
        {
            name: 'demo/blocks.kicad_blocks/Power.kicad_block/Power.kicad_pcb',
            bytes: strToU8('(kicad_pcb (version 20241229))')
        }
    ])

    assert.equal(model.kind, 'design-block-library')
    assert.equal(model.fileType, 'kicad_blocks')
    assert.deepEqual(model.summary, {
        title: 'KiCad design block library',
        libraryCount: 1,
        designBlockCount: 1
    })
    assert.deepEqual(model.blocks[0], {
        name: 'Power',
        libraryName: 'blocks',
        path: 'demo/blocks.kicad_blocks/Power.kicad_block',
        description: 'Fake power block',
        keywords: 'power regulator',
        schematicFile:
            'demo/blocks.kicad_blocks/Power.kicad_block/Power.kicad_sch',
        boardFile: 'demo/blocks.kicad_blocks/Power.kicad_block/Power.kicad_pcb',
        metadataFile: 'demo/blocks.kicad_blocks/Power.kicad_block/block.json',
        metadata: {
            name: 'Power',
            description: 'Fake power block',
            keywords: 'power regulator'
        }
    })
})

test('KicadLegacyLibraryParser exposes legacy .lib and .dcm files for inspection', () => {
    const libModel = KicadLegacyLibraryParser.parse(legacySymbolSource(), {
        fileName: 'Device.lib'
    })
    const dcmModel = KicadLegacyLibraryParser.parse(
        legacyDocumentationSource(),
        {
            fileName: 'Device.dcm'
        }
    )

    assert.equal(libModel.kind, 'legacy-library')
    assert.equal(libModel.fileType, 'lib')
    assert.deepEqual(libModel.summary, {
        title: 'Device',
        symbolCount: 1,
        pinCount: 1,
        graphicCount: 0,
        documentationCount: 0,
        moduleCount: 0
    })
    assert.deepEqual(libModel.symbols[0].pins, [
        {
            name: '~',
            number: '1',
            x: -100,
            y: 0,
            length: 100,
            orientation: 'R',
            electricalType: 'P',
            unit: 1,
            convert: 1,
            nameSize: 50,
            numberSize: 50,
            shapeToken: '',
            pinStyle: 'line',
            hidden: false,
            visible: true
        }
    ])
    assert.equal(dcmModel.fileType, 'dcm')
    assert.deepEqual(dcmModel.documentation[0], {
        name: 'R',
        description: 'Resistor',
        keywords: 'passive resistor',
        datasheet: 'https://example.invalid/resistor.pdf'
    })
})

test('KicadLegacyLibraryParser preserves legacy symbol pin flags and graphics', () => {
    const model = KicadLegacyLibraryParser.parse(legacyGraphicSymbolSource(), {
        fileName: 'Logic.lib'
    })
    const symbol = model.symbols[0]

    assert.deepEqual(model.summary, {
        title: 'Logic',
        symbolCount: 1,
        pinCount: 2,
        graphicCount: 3,
        documentationCount: 0,
        moduleCount: 0
    })
    assert.deepEqual(
        symbol.pins.map((pin) => ({
            name: pin.name,
            number: pin.number,
            electricalType: pin.electricalType,
            shapeToken: pin.shapeToken,
            pinStyle: pin.pinStyle,
            hidden: pin.hidden,
            visible: pin.visible
        })),
        [
            {
                name: '~OE',
                number: '1',
                electricalType: 'I',
                shapeToken: 'IN',
                pinStyle: 'inverted',
                hidden: true,
                visible: false
            },
            {
                name: 'CLK',
                number: '2',
                electricalType: 'I',
                shapeToken: 'C',
                pinStyle: 'clock',
                hidden: false,
                visible: true
            }
        ]
    )
    assert.deepEqual(symbol.graphics.rectangles[0], {
        type: 'rectangle',
        start: { x: -50, y: 50 },
        end: { x: 50, y: -50 },
        unit: 0,
        convert: 1,
        strokeWidth: 0,
        fill: 'none'
    })
    assert.deepEqual(symbol.graphics.circles[0], {
        type: 'circle',
        center: { x: 0, y: 0 },
        radius: 25,
        unit: 0,
        convert: 1,
        strokeWidth: 0,
        fill: 'none'
    })
    assert.deepEqual(symbol.graphics.polylines[0], {
        type: 'polyline',
        pointCount: 3,
        points: [
            { x: -50, y: -50 },
            { x: 0, y: 50 },
            { x: 50, y: -50 }
        ],
        unit: 0,
        convert: 1,
        strokeWidth: 0,
        fill: 'none'
    })
})

/**
 * Builds a fake KiCad jobset JSON fixture.
 * @returns {string}
 */
function jobsetSource() {
    return JSON.stringify({
        meta: {
            version: 1
        },
        jobs: [
            {
                id: 'plot-job',
                type: 'pcb_export_gerbers',
                description: 'Plot Gerbers',
                output: 'fab-folder',
                settings: {
                    layers: ['F.Cu', 'B.Cu']
                }
            },
            {
                id: 'bom-job',
                type: 'sch_export_bom',
                description: 'BOM',
                output: 'archive',
                settings: {
                    format: 'csv'
                }
            }
        ],
        outputs: [
            {
                id: 'fab-folder',
                type: 'folder',
                description: 'Fabrication folder',
                settings: {
                    output_path: 'fab'
                }
            },
            {
                id: 'archive',
                type: 'archive',
                description: 'Archive',
                settings: {
                    output_path: 'fab.zip'
                }
            }
        ]
    })
}

/**
 * Builds a fake KiCad custom DRC rule fixture.
 * @returns {string}
 */
function designRulesSource() {
    return `(version 1)
        (rule "HV clearance"
            (condition "A.NetClass == 'HV'")
            (layer outer)
            (severity error)
            (constraint clearance (min 1mm))
            (constraint track_width (min 0.25) (max 0.6))
        )
        (assign_component_class "Power"
            (condition "A.Reference == 'U1'")
        )`
}

/**
 * Builds a fake worksheet fixture.
 * @returns {string}
 */
function worksheetSource() {
    return `(kicad_wks
        (version 20231118)
        (generator "pl_editor")
        (setup
            (textsize 1.5 1.5)
            (linewidth 0.15)
            (textlinewidth 0.12)
            (left_margin 10)
            (right_margin 10)
            (top_margin 8)
            (bottom_margin 8)
        )
        (line
            (name "border")
            (start 0 0)
            (end 100 0)
            (linewidth 0.15)
        )
        (rect
            (name "title-box")
            (start 0 0)
            (end 100 20)
            (linewidth 0.15)
            (repeat 2)
            (incrx 0)
            (incry 20)
        )
        (tbtext "Title: \${TITLE}"
            (name "title")
            (pos 10 10)
            (font (size 2 2))
        )
    )`
}

/**
 * Builds a fake KiCad exported netlist fixture.
 * @returns {string}
 */
function netlistSource() {
    return `(export
        (version "E")
        (components
            (comp
                (ref "R1")
                (value "10k")
                (footprint "Passives:R_0603")
                (libsource (lib "Device") (part "R"))
                (property (name "Tolerance") (value "1%"))
            )
        )
        (nets
            (net
                (code 1)
                (name "GND")
                (node (ref "R1") (pin "1"))
                (node (ref "J1") (pin "2"))
            )
        )
    )`
}

/**
 * Builds a fake .cmp footprint association fixture.
 * @returns {string}
 */
function footprintAssociationSource() {
    return `(cmp
        (component
            (ref "R1")
            (value "10k")
            (footprint "Passives:R_0603")
        )
        (component
            (ref "C1")
            (value "100n")
            (footprint "Passives:C_0603")
        )
    )`
}

/**
 * Builds a fake legacy symbol library fixture.
 * @returns {string}
 */
function legacySymbolSource() {
    return `EESchema-LIBRARY Version 2.4
#encoding utf-8
#
# R
#
DEF R R 0 40 Y Y 1 F N
F0 "R" 0 0 50 H V C CNN
F1 "R" 0 100 50 H V C CNN
X ~ 1 -100 0 100 R 50 50 1 1 P
ENDDEF
#End Library`
}

/**
 * Builds a fake legacy symbol library fixture with DRAW primitives.
 * @returns {string}
 */
function legacyGraphicSymbolSource() {
    return `EESchema-LIBRARY Version 2.4
#encoding utf-8
#
# GATE
#
DEF GATE U 0 40 Y Y 1 F N
F0 "U" 0 0 50 H V C CNN
F1 "GATE" 0 100 50 H V C CNN
DRAW
S -50 50 50 -50 0 1 0 N
C 0 0 25 0 1 0 N
P 3 0 1 0 -50 -50 0 50 50 -50 N
X ~OE 1 -100 0 100 R 50 50 1 1 I IN
X CLK 2 100 0 100 L 50 50 1 1 I C
ENDDRAW
ENDDEF
#End Library`
}

/**
 * Builds a fake legacy documentation fixture.
 * @returns {string}
 */
function legacyDocumentationSource() {
    return `EESchema-DOCLIB  Version 2.0
$CMP R
D Resistor
K passive resistor
F https://example.invalid/resistor.pdf
$ENDCMP
#End Doc Library`
}
