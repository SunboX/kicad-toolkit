// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import * as nodeApi from '../../src/node.mjs'
import * as parserApi from '../../src/parser.mjs'

const {
    CircuitJsonKicadLibraryExporter,
    CircuitJsonKicadProjectExporter,
    KicadPcbParser,
    KicadLibraryTableParser
} = parserApi

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
 * Counts string matches with a regular expression.
 * @param {string} text Source text.
 * @param {RegExp} pattern Pattern with global flag.
 * @returns {number}
 */
function countMatches(text, pattern) {
    return Array.from(text.matchAll(pattern)).length
}

test('CircuitJsonKicadLibraryExporter can emit package-manager layout metadata', () => {
    const result = CircuitJsonKicadLibraryExporter.export(
        [
            ...packagedComponent('source_pkg', 'pcb_pkg', {
                symbolName: 'Widget',
                footprintName: 'Widget_SMD'
            })
        ],
        {
            libraryName: 'Bundle Parts',
            basePath: 'pkg',
            packageId: 'org.fake.bundle',
            packageName: 'Fake Bundle',
            packageVersion: '1.2.3',
            packageDescription: 'Reusable fake parts',
            packageManagerLayout: true,
            modelFiles: [
                {
                    name: 'widget.step',
                    sourcePath: 'models/widget.step',
                    bytes: new Uint8Array([4, 5, 6])
                }
            ]
        }
    )
    const paths = result.entries.map((entry) => entry.path)
    const metadata = JSON.parse(
        decodeEntry(findEntry(result, 'pkg/metadata.json'))
    )
    const fpTable = KicadLibraryTableParser.parse(
        decodeEntry(findEntry(result, 'pkg/fp-lib-table'))
    )

    assert.deepEqual(
        paths.filter((path) => path.endsWith('.kicad_sym')),
        ['pkg/symbols/Bundle_Parts.kicad_sym']
    )
    assert.deepEqual(
        paths.filter((path) => path.endsWith('.kicad_mod')),
        ['pkg/footprints/Bundle_Parts.pretty/Widget_SMD.kicad_mod']
    )
    assert.deepEqual(
        paths.filter((path) => path.endsWith('.step')),
        ['pkg/3dmodels/Bundle_Parts.3dshapes/widget.step']
    )
    assert.equal(
        fpTable.rows[0].uri,
        '${KICAD_USER_3RD_PARTY}/org.fake.bundle/footprints/Bundle_Parts.pretty'
    )
    assert.equal(metadata.identifier, 'org.fake.bundle')
    assert.equal(metadata.name, 'Fake Bundle')
    assert.equal(metadata.version, '1.2.3')
    assert.deepEqual(metadata.resources.symbols, [
        'symbols/Bundle_Parts.kicad_sym'
    ])
    assert.deepEqual(metadata.resources.footprints, [
        'footprints/Bundle_Parts.pretty'
    ])
    assert.deepEqual(metadata.resources.models3d, [
        '3dmodels/Bundle_Parts.3dshapes'
    ])
})

test('KicadCliVisualSnapshotHarness can require nonblank visual artifacts', async () => {
    const result = await nodeApi.KicadCliVisualSnapshotHarness.render({
        enabled: true,
        projectDir: '/tmp/project',
        outputDir: '/tmp/snapshots',
        files: ['demo.kicad_sch'],
        assertNonBlank: true,
        /**
         * @returns {Promise<object>}
         */
        async execFile() {
            return { stdout: '', stderr: '' }
        },
        /**
         * @returns {Promise<Uint8Array>}
         */
        async readFile() {
            return new TextEncoder().encode('<svg></svg>')
        }
    })

    assert.equal(result.artifacts[0].path, '/tmp/snapshots/demo.svg')
    assert.equal(result.artifacts[0].byteLength, 11)
})

test('KicadCliVisualSnapshotHarness rejects blank visual artifacts when requested', async () => {
    await assert.rejects(
        () =>
            nodeApi.KicadCliVisualSnapshotHarness.render({
                enabled: true,
                projectDir: '/tmp/project',
                outputDir: '/tmp/snapshots',
                files: ['demo.kicad_sch'],
                assertNonBlank: true,
                /**
                 * @returns {Promise<object>}
                 */
                async execFile() {
                    return { stdout: '', stderr: '' }
                },
                /**
                 * @returns {Promise<Uint8Array>}
                 */
                async readFile() {
                    return new Uint8Array()
                }
            }),
        /Visual artifact is blank/
    )
})

test('CircuitJsonKicadProjectExporter emits custom board outlines and cutout shapes', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'pcb_board',
                pcb_board_id: 'board_shape',
                center: { x: 0, y: 0 },
                width: 10,
                height: 8,
                outline: [
                    { x: -5, y: -4 },
                    { x: 5, y: -4 },
                    { x: 3, y: 4 },
                    { x: -5, y: 4 },
                    { x: -5, y: -4 }
                ]
            },
            {
                type: 'pcb_cutout',
                pcb_cutout_id: 'cut_circle',
                shape: 'circle',
                center: { x: 0, y: 0 },
                radius: 1
            },
            {
                type: 'pcb_cutout',
                pcb_cutout_id: 'cut_rect',
                shape: 'rect',
                center: { x: 2, y: 0 },
                width: 2,
                height: 1,
                rotation: 90
            },
            {
                type: 'pcb_cutout',
                pcb_cutout_id: 'cut_polygon',
                shape: 'polygon',
                points: [
                    { x: -3, y: -1 },
                    { x: -2, y: -1 },
                    { x: -2, y: 0 },
                    { x: -3, y: 0 },
                    { x: -3, y: -1 }
                ]
            },
            {
                type: 'pcb_cutout',
                pcb_cutout_id: 'cut_path',
                shape: 'path',
                route: [
                    { x: -4, y: 1 },
                    { x: -3, y: 1 },
                    { x: -3, y: 2 }
                ]
            }
        ],
        { projectName: 'Board Shape' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Board_Shape.kicad_pcb')
    )

    assert.doesNotMatch(pcbText, /\(gr_rect/)
    assert.match(
        pcbText,
        /\(gr_line\s+\(start -5 4\)\s+\(end 5 4\)[\s\S]*?\(layer "Edge\.Cuts"\)/
    )
    assert.match(
        pcbText,
        /\(gr_line\s+\(start -5 -4\)\s+\(end -5 4\)[\s\S]*?\(layer "Edge\.Cuts"\)/
    )
    assert.match(
        pcbText,
        /\(gr_circle\s+\(center 0 0\)\s+\(end 1 0\)[\s\S]*?\(layer "Edge\.Cuts"\)/
    )
    assert.equal(
        countMatches(pcbText, /\(gr_poly[\s\S]*?\(layer "Edge\.Cuts"\)/gu),
        2
    )
    assert.match(
        pcbText,
        /\(gr_line\s+\(start -4 -1\)\s+\(end -3 -1\)[\s\S]*?\(uuid/
    )
})

test('CircuitJsonKicadProjectExporter emits filled custom symbol paths, symbol arcs, and deduped pins', () => {
    const result = CircuitJsonKicadProjectExporter.export(filledSymbolBoard(), {
        projectName: 'Filled Symbol'
    })
    const symbolText = decodeEntry(
        findEntry(result, 'kicad/Filled_Symbol.kicad_sym')
    )

    assert.equal(countMatches(symbolText, /\(pin passive line/gu), 2)
    assert.doesNotMatch(symbolText, /DUP/)
    assert.match(symbolText, /\(polyline[\s\S]*?\(fill \(type background\)\)/)
    assert.match(
        symbolText,
        /\(arc\s+\(start -1 0\)\s+\(mid 0 -1\)\s+\(end 1 0\)[\s\S]*?\(stroke \(width 0\.05\)/
    )
})

test('CircuitJsonKicadProjectExporter emits top-level schematic arcs', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'schematic_arc',
                schematic_arc_id: 'arc_top',
                center: { x: 0, y: 0 },
                radius: 1,
                startAngleDegrees: 0,
                endAngleDegrees: 180,
                stroke_width: 0.1
            }
        ],
        { projectName: 'Schematic Arc' }
    )
    const schematicText = decodeEntry(
        findEntry(result, 'kicad/Schematic_Arc.kicad_sch')
    )

    assert.match(
        schematicText,
        /\(arc\s+\(start 1 0\)\s+\(mid 0 -1\)\s+\(end -1 0\)[\s\S]*?\(uuid/
    )
})

test('CircuitJsonKicadProjectExporter emits page graphics without electrical wires', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'schematic_line',
                schematic_line_id: 'wire_1',
                x1: 0,
                y1: 0,
                x2: 5,
                y2: 0
            },
            {
                type: 'schematic_line',
                schematic_line_id: 'divider_1',
                x1: 0,
                y1: 2,
                x2: 10,
                y2: 2,
                is_page_graphic: true
            },
            {
                type: 'schematic_text',
                schematic_text_id: 'caption_1',
                text: 'Fake region',
                position: { x: 0.5, y: 2.5 },
                font_size: 2
            },
            {
                type: 'schematic_section',
                schematic_section_id: 'region_1',
                display_name: 'Grouped fake items',
                center: { x: 5, y: 5 },
                width: 10,
                height: 4
            }
        ],
        { projectName: 'Page Graphics' }
    )
    const schematicEntry = findEntry(result, 'kicad/Page_Graphics.kicad_sch')
    const schematicText = decodeEntry(schematicEntry)
    const parsed = parserApi.KicadParser.parseArrayBuffer(
        'Page_Graphics.kicad_sch',
        schematicEntry.bytes
    )

    assert.equal(countMatches(schematicText, /\(wire\s/gu), 1)
    assert.match(
        schematicText,
        /\(polyline\s+\(pts\s+\(xy 0 -2\)\s+\(xy 10 -2\)\)/
    )
    assert.match(schematicText, /\(rectangle[\s\S]*?\(uuid/)
    assert.match(schematicText, /\(text "Grouped fake items"/)
    assert.match(
        schematicText,
        /\(text "Fake region"[\s\S]*?\(font \(size 2 2\)/
    )
    assert.equal(
        parsed.schematic.lines.some((line) => line.sourceType === 'polyline'),
        true
    )
    assert.equal(
        parsed.schematic.lines.some((line) => line.sourceType === 'wire'),
        true
    )
})

test('CircuitJsonKicadProjectExporter honors schematic label kind and explicit rotation', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'schematic_net_label',
                schematic_net_label_id: 'local_label',
                text: 'LOCAL_NET',
                x: 1,
                y: 2,
                label_type: 'local',
                rotation: 90,
                font_size: 2
            },
            {
                type: 'schematic_net_label',
                schematic_net_label_id: 'global_label',
                text: 'GLOBAL_NET',
                anchor_position: { x: 3, y: 4 },
                label_type: 'global',
                shape: 'output',
                rotation: 270
            }
        ],
        { projectName: 'Rotated Labels' }
    )
    const schematicText = decodeEntry(
        findEntry(result, 'kicad/Rotated_Labels.kicad_sch')
    )

    assert.match(
        schematicText,
        /\(label "LOCAL_NET"\s+\(at 1 -2 90\)[\s\S]*?\(font \(size 2 2\)/
    )
    assert.doesNotMatch(schematicText, /\(global_label "LOCAL_NET"/)
    assert.match(
        schematicText,
        /\(global_label "GLOBAL_NET"\s+\(shape output\)\s+\(at 3 -4 270\)/
    )
})

test('CircuitJsonKicadProjectExporter emits KiCad symbol search metadata', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            ...packagedComponent('source_meta', 'pcb_meta', {
                symbolName: 'MetaWidget',
                footprintName: 'MetaWidget_SMD',
                symbolMetadata: {
                    keywords: ['fake', 'metadata'],
                    fp_filters: ['MetaWidget_*', 'FakeWidget_*']
                }
            })
        ],
        { projectName: 'Search Metadata' }
    )
    const symbolText = decodeEntry(
        findEntry(result, 'kicad/Search_Metadata.kicad_sym')
    )

    assert.match(
        symbolText,
        /\(property "?ki_keywords"? "fake metadata"[\s\S]*?\(hide\)/
    )
    assert.match(
        symbolText,
        /\(property "?ki_fp_filters"? "MetaWidget_\* FakeWidget_\*"[\s\S]*?\(hide\)/
    )
})

test('CircuitJsonKicadProjectExporter outputs parseable schematic and PCB files', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            ...packagedComponent('source_round', 'pcb_round', {
                symbolName: 'RoundWidget',
                footprintName: 'RoundWidget_SMD'
            }),
            {
                type: 'pcb_board',
                pcb_board_id: 'board_round',
                center: { x: 0, y: 0 },
                width: 12,
                height: 8
            },
            {
                type: 'schematic_line',
                schematic_line_id: 'round_graphic',
                x1: 0,
                y1: 1,
                x2: 5,
                y2: 1,
                is_page_graphic: true
            },
            {
                type: 'schematic_net_label',
                schematic_net_label_id: 'round_local',
                text: 'ROUND_LOCAL',
                x: 0,
                y: 0,
                label_type: 'local',
                rotation: 90
            }
        ],
        { projectName: 'Parse Back' }
    )
    const schematicEntry = findEntry(result, 'kicad/Parse_Back.kicad_sch')
    const pcbEntry = findEntry(result, 'kicad/Parse_Back.kicad_pcb')
    const schematic = parserApi.KicadParser.parseArrayBuffer(
        'Parse_Back.kicad_sch',
        schematicEntry.bytes
    )
    const pcb = parserApi.KicadParser.parseArrayBuffer(
        'Parse_Back.kicad_pcb',
        pcbEntry.bytes
    )

    assert.equal(schematic.kind, 'schematic')
    assert.equal(pcb.kind, 'pcb')
    assert.equal(
        schematic.schematic.lines.some(
            (line) => line.sourceType === 'polyline'
        ),
        true
    )
    assert.equal(
        schematic.schematic.texts.some(
            (text) =>
                text.text === 'ROUND_LOCAL' &&
                text.labelKind === 'local' &&
                text.rotation === 90
        ),
        true
    )
    assert.equal(pcb.summary.componentCount, 1)
    assert.equal(pcb.pcb.pads.length, 1)
})

test('CircuitJsonKicadProjectExporter emits filled copper pour polygons', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_net',
                source_net_id: 'source_net_gnd',
                name: 'GND'
            },
            {
                type: 'pcb_copper_pour',
                pcb_copper_pour_id: 'pour_gnd',
                net: 'GND',
                layer: 'top',
                points: [
                    { x: -4, y: -3 },
                    { x: 4, y: -3 },
                    { x: 4, y: 3 },
                    { x: -4, y: 3 },
                    { x: -4, y: -3 }
                ]
            }
        ],
        { projectName: 'Filled Pour' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Filled_Pour.kicad_pcb')
    )
    const parsed = KicadPcbParser.parse(pcbText)
    const zones = parsed.drawings.filter((drawing) => drawing.type === 'zone')

    assert.match(pcbText, /\(filled_polygon\s+\(layer "F\.Cu"\)/)
    assert.equal(zones.length, 1)
    assert.equal(zones[0].netName, 'GND')
    assert.equal(zones[0].contours.length, 1)
})

test('CircuitJsonKicadProjectExporter preserves B-Rep copper pour inner rings', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'pcb_copper_pour',
                pcb_copper_pour_id: 'pour_with_hole',
                net: 'GND',
                layer: 'bottom',
                shape: 'brep',
                brep_shape: {
                    outer_ring: {
                        vertices: [
                            { x: -5, y: -5 },
                            { x: 5, y: -5 },
                            { x: 5, y: 5 },
                            { x: -5, y: 5 },
                            { x: -5, y: -5 }
                        ]
                    },
                    inner_rings: [
                        {
                            vertices: [
                                { x: -1, y: -1 },
                                { x: 1, y: -1 },
                                { x: 1, y: 1 },
                                { x: -1, y: 1 },
                                { x: -1, y: -1 }
                            ]
                        }
                    ]
                }
            }
        ],
        { projectName: 'Holed Pour' }
    )
    const pcbText = decodeEntry(findEntry(result, 'kicad/Holed_Pour.kicad_pcb'))
    const parsed = KicadPcbParser.parse(pcbText)
    const zones = parsed.drawings.filter((drawing) => drawing.type === 'zone')

    assert.equal(countMatches(pcbText, /\(polygon\s+\(pts/gu), 2)
    assert.match(pcbText, /\(filled_polygon\s+\(layer "B\.Cu"\)/)
    assert.equal(zones.length, 1)
    assert.equal(zones[0].contours.length, 2)
    assert.deepEqual(zones[0].contours[1], [
        { x: -1, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: -1 },
        { x: -1, y: -1 }
    ])
})

test('CircuitJsonKicadProjectExporter routes through pads using endpoint layers', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'pcb_board',
                pcb_board_id: 'board_route',
                num_layers: 4
            },
            {
                type: 'pcb_trace',
                pcb_trace_id: 'trace_pad',
                net: 'SIG',
                route: [
                    {
                        route_type: 'wire',
                        x: 0,
                        y: 0,
                        layer: 'top',
                        width: 0.15
                    },
                    {
                        route_type: 'through_pad',
                        start: { x: 1, y: 0 },
                        end: { x: 1, y: 1 },
                        start_layer: 'top',
                        end_layer: 'inner1',
                        width: 0.2
                    },
                    {
                        route_type: 'wire',
                        x: 2,
                        y: 1,
                        layer: 'inner1',
                        width: 0.25
                    }
                ]
            }
        ],
        { projectName: 'Through Pad Route' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Through_Pad_Route.kicad_pcb')
    )

    assert.match(
        pcbText,
        /\(segment\s+\(start 0 0\)\s+\(end 1 -1\)[\s\S]*?\(width 0\.15\)[\s\S]*?\(layer "F\.Cu"\)/
    )
    assert.match(
        pcbText,
        /\(segment\s+\(start 1 0\)\s+\(end 2 -1\)[\s\S]*?\(width 0\.2\)[\s\S]*?\(layer "In1\.Cu"\)/
    )
})

test('CircuitJsonKicadProjectExporter dedupes route vias against standalone vias', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'pcb_via',
                pcb_via_id: 'via_existing',
                net: 'SIG',
                x: 1,
                y: 2,
                outer_diameter: 0.7,
                hole_diameter: 0.3,
                from_layer: 'top',
                to_layer: 'bottom'
            },
            {
                type: 'pcb_trace',
                pcb_trace_id: 'trace_duplicate_via',
                net: 'SIG',
                route: [
                    { route_type: 'wire', x: 0, y: 2, layer: 'top' },
                    {
                        route_type: 'via',
                        x: 1,
                        y: 2,
                        outer_diameter: 0.7,
                        hole_diameter: 0.3,
                        from_layer: 'top',
                        to_layer: 'bottom'
                    },
                    { route_type: 'wire', x: 2, y: 2, layer: 'bottom' }
                ]
            }
        ],
        { projectName: 'Dedupe Vias' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Dedupe_Vias.kicad_pcb')
    )

    assert.equal(countMatches(pcbText, /\(via\s/gu), 1)
})

test('CircuitJsonKicadProjectExporter assigns route via nets from source-net trace ids', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_net',
                source_net_id: 'source_net_sig',
                name: 'SIG'
            },
            {
                type: 'pcb_trace',
                pcb_trace_id: 'trace_source_net',
                source_trace_id: 'source_net_sig',
                route: [
                    { route_type: 'wire', x: 0, y: 0, layer: 'top' },
                    {
                        route_type: 'via',
                        x: 1,
                        y: 0,
                        from_layer: 'top',
                        to_layer: 'bottom'
                    },
                    { route_type: 'wire', x: 2, y: 0, layer: 'bottom' }
                ]
            }
        ],
        { projectName: 'Via Net Fallback' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Via_Net_Fallback.kicad_pcb')
    )
    const netMatch = pcbText.match(/\(net (\d+) "SIG"\)/)

    assert.ok(netMatch)
    assert.match(
        pcbText,
        new RegExp('\\(via\\s+[\\s\\S]*?\\(net ' + netMatch[1] + '\\)')
    )
    assert.doesNotMatch(pcbText, /\(via\s+[\s\S]*?\(net 0\)/)
})

/**
 * Builds source and PCB rows with package metadata.
 * @param {string} sourceId Source component id.
 * @param {string} pcbId PCB component id.
 * @param {object} options Metadata options.
 * @returns {object[]}
 */
function packagedComponent(sourceId, pcbId, options) {
    return [
        {
            type: 'source_component',
            source_component_id: sourceId,
            name: options.symbolName,
            metadata: {
                kicad_symbol: {
                    name: options.symbolName,
                    ...(options.symbolMetadata || {})
                },
                kicad_footprint: {
                    name: options.footprintName,
                    ...(options.footprintMetadata || {})
                }
            }
        },
        {
            type: 'pcb_component',
            pcb_component_id: pcbId,
            source_component_id: sourceId,
            center: { x: 0, y: 0 },
            layer: 'top'
        },
        {
            type: 'pcb_smtpad',
            pcb_smtpad_id: pcbId + '_pad_1',
            pcb_component_id: pcbId,
            shape: 'rect',
            x: 0,
            y: 0,
            width: 1,
            height: 1
        }
    ]
}

/**
 * Builds a fake custom-symbol board with filled graphics and duplicate ports.
 * @returns {object[]}
 */
function filledSymbolBoard() {
    return [
        {
            type: 'source_component',
            source_component_id: 'source_shape',
            name: 'U1'
        },
        {
            type: 'source_port',
            source_port_id: 'source_shape_pin_1',
            source_component_id: 'source_shape',
            name: 'A',
            pin_number: 1
        },
        {
            type: 'source_port',
            source_port_id: 'source_shape_pin_2',
            source_component_id: 'source_shape',
            name: 'B',
            pin_number: 2
        },
        {
            type: 'schematic_component',
            schematic_component_id: 'schematic_shape',
            source_component_id: 'source_shape',
            schematic_symbol_id: 'symbol_shape',
            center: { x: 0, y: 0 }
        },
        {
            type: 'schematic_symbol',
            schematic_symbol_id: 'symbol_shape',
            name: 'FilledShape',
            center: { x: 0, y: 0 },
            width: 4,
            height: 4
        },
        {
            type: 'schematic_port',
            schematic_port_id: 'schematic_shape_pin_1_generated',
            schematic_component_id: 'schematic_shape',
            source_port_id: 'source_shape_pin_1',
            display_pin_label: 'DUP',
            pin_number: 1,
            center: { x: -2, y: 0 },
            facing_direction: 'left'
        },
        {
            type: 'schematic_port',
            schematic_port_id: 'schematic_shape_pin_1',
            schematic_component_id: 'schematic_shape',
            schematic_symbol_id: 'symbol_shape',
            source_port_id: 'source_shape_pin_1',
            display_pin_label: 'A',
            pin_number: 1,
            center: { x: -2, y: 0 },
            facing_direction: 'left'
        },
        {
            type: 'schematic_port',
            schematic_port_id: 'schematic_shape_pin_2',
            schematic_component_id: 'schematic_shape',
            schematic_symbol_id: 'symbol_shape',
            source_port_id: 'source_shape_pin_2',
            display_pin_label: 'B',
            pin_number: 2,
            center: { x: 2, y: 0 },
            facing_direction: 'right'
        },
        {
            type: 'schematic_path',
            schematic_path_id: 'shape_fill',
            schematic_symbol_id: 'symbol_shape',
            points: [
                { x: -1, y: -1 },
                { x: 1, y: -1 },
                { x: 1, y: 1 },
                { x: -1, y: 1 },
                { x: -1, y: -1 }
            ],
            is_filled: true,
            stroke_width: 0.05
        },
        {
            type: 'schematic_arc',
            schematic_arc_id: 'shape_arc',
            schematic_symbol_id: 'symbol_shape',
            center: { x: 0, y: 0 },
            radius: 1,
            start_angle_degrees: 180,
            end_angle_degrees: 0,
            stroke_width: 0.05
        }
    ]
}
