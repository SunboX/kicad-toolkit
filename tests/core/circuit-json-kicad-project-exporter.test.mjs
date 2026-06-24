// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    CircuitJsonKicadProjectExporter,
    KicadLibraryTableParser,
    KicadPcbParser,
    SExpressionParser,
    SExpressionTree
} from '../../src/parser.mjs'

/**
 * Decodes one export entry as UTF-8 text.
 * @param {{ bytes: Uint8Array }} entry Export entry.
 * @returns {string}
 */
function decodeEntry(entry) {
    return new TextDecoder().decode(entry.bytes)
}

/**
 * Finds one export entry by archive path.
 * @param {{ entries: { path: string, bytes: Uint8Array }[] }} result Export result.
 * @param {string} path Archive path.
 * @returns {{ path: string, bytes: Uint8Array }}
 */
function findEntry(result, path) {
    const entry = result.entries.find((candidate) => candidate.path === path)
    assert.ok(entry, 'Missing export entry: ' + path)
    return entry
}

/**
 * Builds a compact board model with schematic, PCB, net, and route elements.
 * @returns {object[]}
 */
function createCircuitJsonBoard() {
    return [
        {
            type: 'source_project_metadata',
            name: 'Demo Board',
            software_used_string: 'ecad-forge-test'
        },
        {
            type: 'pcb_board',
            pcb_board_id: 'board_1',
            center: { x: 0, y: 0 },
            width: 12,
            height: 8,
            num_layers: 2,
            min_trace_width: 0.18,
            min_via_pad_diameter: 0.6,
            min_via_hole_diameter: 0.3
        },
        {
            type: 'source_component',
            source_component_id: 'source_u1',
            name: 'U1',
            manufacturer_part_number: 'Demo IC',
            ftype: 'simple_chip'
        },
        {
            type: 'source_port',
            source_port_id: 'source_u1_port_1',
            source_component_id: 'source_u1',
            name: 'GND',
            pin_number: 1
        },
        {
            type: 'source_net',
            source_net_id: 'source_net_gnd',
            name: 'GND',
            member_source_group_ids: []
        },
        {
            type: 'schematic_component',
            schematic_component_id: 'schematic_u1',
            source_component_id: 'source_u1',
            center: { x: 0, y: 0 },
            size: { width: 2.54, height: 2.54 },
            rotation: 0
        },
        {
            type: 'schematic_port',
            schematic_port_id: 'schematic_u1_port_1',
            source_port_id: 'source_u1_port_1',
            schematic_component_id: 'schematic_u1',
            center: { x: -1.27, y: 0 },
            facing_direction: 'left'
        },
        {
            type: 'pcb_component',
            pcb_component_id: 'pcb_u1',
            source_component_id: 'source_u1',
            center: { x: 1, y: 1 },
            layer: 'top',
            rotation: 90,
            width: 3,
            height: 2
        },
        {
            type: 'pcb_port',
            pcb_port_id: 'pcb_u1_port_1',
            source_port_id: 'source_u1_port_1',
            x: 0.5,
            y: 1,
            layers: ['top']
        },
        {
            type: 'pcb_smtpad',
            pcb_smtpad_id: 'pad_1',
            pcb_component_id: 'pcb_u1',
            pcb_port_id: 'pcb_u1_port_1',
            shape: 'rect',
            x: 0.5,
            y: 1,
            width: 1,
            height: 0.6,
            layer: 'top',
            net: 'GND',
            port_hints: ['1']
        },
        {
            type: 'pcb_trace',
            pcb_trace_id: 'trace_1',
            net: 'GND',
            route: [
                {
                    route_type: 'wire',
                    x: 0.5,
                    y: 1,
                    width: 0.18,
                    layer: 'top'
                },
                {
                    route_type: 'wire',
                    x: 3,
                    y: 1,
                    width: 0.18,
                    layer: 'top'
                }
            ]
        },
        {
            type: 'pcb_via',
            pcb_via_id: 'via_1',
            x: 3,
            y: 1,
            outer_diameter: 0.6,
            hole_diameter: 0.3,
            layers: ['top', 'bottom'],
            net: 'GND'
        }
    ]
}

/**
 * Verifies a complete project export is produced from CircuitJSON elements.
 */
test('CircuitJsonKicadProjectExporter exports KiCad project entries', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        createCircuitJsonBoard(),
        { projectName: 'Demo Board' }
    )

    assert.deepEqual(result.diagnostics, [])
    assert.deepEqual(
        result.entries.map((entry) => entry.path).sort(),
        [
            'kicad/Demo_Board.kicad_pcb',
            'kicad/Demo_Board.kicad_pro',
            'kicad/Demo_Board.kicad_sch',
            'kicad/Demo_Board.kicad_sym',
            'kicad/Demo_Board.pretty/U1.kicad_mod',
            'kicad/fp-lib-table',
            'kicad/sym-lib-table'
        ].sort()
    )

    const schematicRoot = SExpressionParser.parse(
        decodeEntry(findEntry(result, 'kicad/Demo_Board.kicad_sch'))
    )
    const pcbRoot = SExpressionParser.parse(
        decodeEntry(findEntry(result, 'kicad/Demo_Board.kicad_pcb'))
    )
    const symbolRoot = SExpressionParser.parse(
        decodeEntry(findEntry(result, 'kicad/Demo_Board.kicad_sym'))
    )
    const footprintRoot = SExpressionParser.parse(
        decodeEntry(findEntry(result, 'kicad/Demo_Board.pretty/U1.kicad_mod'))
    )
    const project = JSON.parse(
        decodeEntry(findEntry(result, 'kicad/Demo_Board.kicad_pro'))
    )
    const fpTable = KicadLibraryTableParser.parse(
        decodeEntry(findEntry(result, 'kicad/fp-lib-table'))
    )
    const symTable = KicadLibraryTableParser.parse(
        decodeEntry(findEntry(result, 'kicad/sym-lib-table'))
    )

    assert.equal(SExpressionTree.nodeName(schematicRoot), 'kicad_sch')
    assert.equal(SExpressionTree.nodeName(pcbRoot), 'kicad_pcb')
    assert.equal(SExpressionTree.nodeName(symbolRoot), 'kicad_symbol_lib')
    assert.equal(SExpressionTree.nodeName(footprintRoot), 'footprint')
    assert.equal(project.head.project_name, 'Demo_Board')
    assert.equal(project.board.last_opened_board, 'Demo_Board.kicad_pcb')
    assert.equal(fpTable.rows[0].name, 'Demo_Board')
    assert.equal(symTable.rows[0].name, 'Demo_Board')
    assert.match(
        decodeEntry(findEntry(result, 'kicad/Demo_Board.kicad_pcb')),
        /\(net 1 "GND"\)/
    )
    assert.match(
        decodeEntry(findEntry(result, 'kicad/Demo_Board.kicad_pcb')),
        /\(segment/
    )
    assert.match(
        decodeEntry(findEntry(result, 'kicad/Demo_Board.kicad_pcb')),
        /\(via/
    )
})

/**
 * Verifies project-local 3D model entries and footprint references.
 */
test('CircuitJsonKicadProjectExporter resolves project model files', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        createCircuitJsonBoard(),
        {
            projectName: 'Demo Board',
            modelFiles: [
                {
                    sourcePath: 'library/models/body.step?download=1',
                    bytes: new Uint8Array([1, 2, 3]),
                    format: 'step'
                }
            ]
        }
    )
    const footprintText = decodeEntry(
        findEntry(result, 'kicad/Demo_Board.pretty/U1.kicad_mod')
    )

    assert.deepEqual(
        [...findEntry(result, 'kicad/models/body.step').bytes],
        [1, 2, 3]
    )
    assert.deepEqual(result.model3dSourcePaths, [
        'library/models/body.step?download=1'
    ])
    assert.match(footprintText, /\(model "\$\{KIPRJMOD\}\/models\/body\.step"/)
})

/**
 * Verifies callers can reference externally packaged model entries.
 */
test('CircuitJsonKicadProjectExporter supports external model entry paths', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        createCircuitJsonBoard(),
        {
            projectName: 'Demo Board',
            includeModelEntries: false,
            modelPathPrefix: '${KIPRJMOD}/../../models/',
            modelFiles: [
                {
                    name: 'body.step',
                    bytes: new Uint8Array([4, 5, 6])
                }
            ]
        }
    )
    const footprintText = decodeEntry(
        findEntry(result, 'kicad/Demo_Board.pretty/U1.kicad_mod')
    )

    assert.equal(
        result.entries.some((entry) => entry.path === 'kicad/models/body.step'),
        false
    )
    assert.match(
        footprintText,
        /\(model "\$\{KIPRJMOD\}\/\.\.\/\.\.\/models\/body\.step"/
    )
})

/**
 * Verifies multilayer boards preserve inner copper layers and route vias.
 */
test('CircuitJsonKicadProjectExporter exports multilayer traces and route vias', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'pcb_board',
                pcb_board_id: 'board_1',
                center: { x: 0, y: 0 },
                width: '20mm',
                height: '12mm',
                num_layers: 4
            },
            {
                type: 'pcb_trace',
                pcb_trace_id: 'trace_sig',
                net: 'SIG',
                route: [
                    {
                        route_type: 'wire',
                        x: '0mm',
                        y: '0mm',
                        width: '0.2mm',
                        layer: 'top'
                    },
                    {
                        route_type: 'via',
                        x: '2mm',
                        y: '0mm',
                        outer_diameter: '0.7mm',
                        hole_diameter: '0.3mm',
                        from_layer: 'top',
                        to_layer: 'inner1'
                    },
                    {
                        route_type: 'wire',
                        x: '5mm',
                        y: '1mm',
                        width: '0.2mm',
                        layer: 'inner1'
                    }
                ]
            }
        ],
        { projectName: 'Layered Board' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Layered_Board.kicad_pcb')
    )

    assert.match(pcbText, /\(1 "In1\.Cu" signal\)/)
    assert.match(pcbText, /\(2 "In2\.Cu" signal\)/)
    assert.match(pcbText, /\(layer "In1\.Cu"\)/)
    assert.match(pcbText, /\(via\s+\(at 2 0\)\s+\(size 0\.7\)/)
    assert.match(pcbText, /\(layers "F\.Cu" "In1\.Cu"\)/)
})

/**
 * Verifies copper pours, cutouts, and board drawing rows are exported.
 */
test('CircuitJsonKicadProjectExporter exports PCB zones and drawing graphics', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'pcb_board',
                pcb_board_id: 'board_1',
                center: { x: 0, y: 0 },
                width: 10,
                height: 6
            },
            {
                type: 'pcb_copper_pour',
                pcb_copper_pour_id: 'pour_1',
                net: 'GND',
                layer: 'top',
                points: [
                    { x: -3, y: -2 },
                    { x: 3, y: -2 },
                    { x: 3, y: 2 },
                    { x: -3, y: 2 }
                ]
            },
            {
                type: 'pcb_cutout',
                pcb_cutout_id: 'cutout_1',
                points: [
                    { x: -1, y: -1 },
                    { x: 1, y: -1 },
                    { x: 1, y: 1 },
                    { x: -1, y: 1 }
                ]
            },
            {
                type: 'pcb_silkscreen_line',
                pcb_silkscreen_line_id: 'silk_1',
                x1: -4,
                y1: 2.5,
                x2: 4,
                y2: 2.5,
                width: 0.15,
                layer: 'top_silkscreen'
            },
            {
                type: 'pcb_fabrication_note_text',
                pcb_fabrication_note_text_id: 'fab_1',
                text: 'PIN 1',
                x: -3,
                y: -2.5,
                layer: 'top_fabrication'
            }
        ],
        { projectName: 'Artwork Board' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Artwork_Board.kicad_pcb')
    )

    assert.match(pcbText, /\(zone\s+\(net 1\)\s+\(net_name "GND"\)/)
    assert.match(pcbText, /\(polygon\s+\(pts\s+\(xy -3 2\)/)
    assert.match(pcbText, /\(gr_poly\s+\(pts\s+\(xy -1 1\)/)
    assert.match(pcbText, /\(layer "Edge\.Cuts"\)/)
    assert.match(pcbText, /\(gr_line\s+\(start -4 -2\.5\)/)
    assert.match(pcbText, /\(layer "F\.SilkS"\)/)
    assert.match(pcbText, /\(gr_text "PIN 1"/)
    assert.match(pcbText, /\(layer "F\.Fab"\)/)
})

/**
 * Verifies schematic wires and labels are emitted alongside placed symbols.
 */
test('CircuitJsonKicadProjectExporter exports schematic wires and labels', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_u1',
                name: 'U1'
            },
            {
                type: 'schematic_component',
                schematic_component_id: 'schematic_u1',
                source_component_id: 'source_u1',
                center: { x: 0, y: 0 },
                size: { width: 4, height: 3 }
            },
            {
                type: 'schematic_line',
                schematic_line_id: 'wire_1',
                x1: 2,
                y1: 0,
                x2: 8,
                y2: 0
            },
            {
                type: 'schematic_net_label',
                schematic_net_label_id: 'label_1',
                text: 'SIG',
                anchor_position: { x: 8, y: 0 }
            }
        ],
        { projectName: 'Sheet Board' }
    )
    const schematicText = decodeEntry(
        findEntry(result, 'kicad/Sheet_Board.kicad_sch')
    )

    assert.match(schematicText, /\(wire\s+\(pts\s+\(xy 2 0\)\s+\(xy 8 0\)\)/)
    assert.match(schematicText, /\(label "SIG"\s+\(at 8 0 0\)/)
})

/**
 * Verifies board-owned pads and holes are exported as project-local footprints.
 */
test('CircuitJsonKicadProjectExporter exports standalone board pads and holes', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'pcb_board',
                pcb_board_id: 'board_1',
                center: { x: 0, y: 0 },
                width: 18,
                height: 12
            },
            {
                type: 'pcb_smtpad',
                pcb_smtpad_id: 'fid_1',
                shape: 'circle',
                x: -4,
                y: 2,
                diameter: 1,
                layer: 'top',
                net: 'FID'
            },
            {
                type: 'pcb_hole',
                pcb_hole_id: 'mount_1',
                hole_shape: 'rotated_pill',
                x: 0,
                y: 0,
                hole_width: 1,
                hole_height: 2,
                ccw_rotation: 45
            },
            {
                type: 'pcb_plated_hole',
                pcb_plated_hole_id: 'testpoint_1',
                shape: 'circular_hole_with_rect_pad',
                x: 4,
                y: -2,
                hole_diameter: 0.6,
                rect_pad_width: 1.6,
                rect_pad_height: 1,
                rect_ccw_rotation: 30,
                net: 'TP'
            }
        ],
        { projectName: 'Standalone Board' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Standalone_Board.kicad_pcb')
    )

    assert.match(pcbText, /\(footprint "Standalone_Board:fid_1"/)
    assert.match(pcbText, /\(footprint "Standalone_Board:mount_1"/)
    assert.match(pcbText, /\(footprint "Standalone_Board:testpoint_1"/)
    assert.match(pcbText, /\(pad "1" smd circle/)
    assert.match(pcbText, /\(pad "" np_thru_hole oval/)
    assert.match(pcbText, /\(drill oval 1 2\)/)
    assert.match(pcbText, /\(pad "1" thru_hole rect/)
    assert.match(pcbText, /\(at 0 0 30\)/)
})

/**
 * Verifies advanced pad geometry survives export and parse-back.
 */
test('CircuitJsonKicadProjectExporter exports rich pad shapes for parse-back', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_u1',
                name: 'U1'
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_u1',
                source_component_id: 'source_u1',
                center: { x: 0, y: 0 },
                layer: 'top'
            },
            {
                type: 'pcb_smtpad',
                pcb_smtpad_id: 'poly_1',
                pcb_component_id: 'pcb_u1',
                shape: 'polygon',
                points: [
                    { x: -1, y: -1 },
                    { x: 1, y: -1 },
                    { x: 0.5, y: 1 },
                    { x: -1, y: 1 }
                ],
                layer: 'top',
                net: 'SIG'
            },
            {
                type: 'pcb_smtpad',
                pcb_smtpad_id: 'round_1',
                pcb_component_id: 'pcb_u1',
                shape: 'rotated_rect',
                x: 4,
                y: 0,
                width: 1.8,
                height: 0.9,
                corner_radius: 0.18,
                ccw_rotation: 15,
                layer: 'bottom'
            },
            {
                type: 'pcb_plated_hole',
                pcb_plated_hole_id: 'slot_1',
                pcb_component_id: 'pcb_u1',
                shape: 'pill',
                x: 0,
                y: 4,
                hole_width: 0.7,
                hole_height: 1.4,
                outer_width: 1.4,
                outer_height: 2.2,
                hole_offset_x: 0.1,
                hole_offset_y: -0.2,
                ccw_rotation: 90
            },
            {
                type: 'pcb_hole',
                pcb_hole_id: 'npth_1',
                pcb_component_id: 'pcb_u1',
                hole_shape: 'circle',
                x: -4,
                y: 0,
                hole_diameter: 1.1
            }
        ],
        { projectName: 'Pad Shapes' }
    )
    const pcbText = decodeEntry(findEntry(result, 'kicad/Pad_Shapes.kicad_pcb'))
    const parsed = KicadPcbParser.parse(pcbText)

    assert.match(pcbText, /\(pad "1" smd custom/)
    assert.match(pcbText, /\(options \(anchor circle\)\)/)
    assert.match(pcbText, /\(primitives \(gr_poly/)
    assert.match(pcbText, /\(pad "2" smd roundrect/)
    assert.match(pcbText, /\(roundrect_rratio 0\.2\)/)
    assert.match(pcbText, /\(pad "3" thru_hole oval/)
    assert.match(pcbText, /\(drill oval 0\.7 1\.4 \(offset -0\.1 -0\.2\)\)/)
    assert.match(pcbText, /\(pad "" np_thru_hole circle/)
    assert.equal(parsed.footprints.length, 1)
    assert.equal(parsed.pads.length, 4)
    assert.equal(
        parsed.pads.some((pad) => pad.shape === 'custom'),
        true
    )
    assert.equal(
        parsed.pads.some((pad) => pad.type === 'np_thru_hole'),
        true
    )
})

/**
 * Verifies large schematics pick a fitting sheet and include root sheet metadata.
 */
test('CircuitJsonKicadProjectExporter exports schematic sheet metadata', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_a',
                name: 'U1'
            },
            {
                type: 'schematic_component',
                schematic_component_id: 'schematic_a',
                source_component_id: 'source_a',
                center: { x: -180, y: -100 },
                size: { width: 20, height: 20 }
            },
            {
                type: 'schematic_line',
                schematic_line_id: 'wide_wire',
                x1: -180,
                y1: -100,
                x2: 180,
                y2: 100
            },
            {
                type: 'schematic_text',
                schematic_text_id: 'note_1',
                text: 'Assembly note',
                position: { x: 175, y: 95 }
            }
        ],
        { projectName: 'Large Sheet' }
    )
    const schematicText = decodeEntry(
        findEntry(result, 'kicad/Large_Sheet.kicad_sch')
    )

    assert.match(schematicText, /\(paper "A3"\)/)
    assert.match(
        schematicText,
        /\(sheet_instances \(path "\/" \(page "1"\)\)\)/
    )
    assert.match(schematicText, /\(embedded_fonts no\)/)
    assert.match(schematicText, /\(text "Assembly note" \(at 175 -95 0\)/)
})
