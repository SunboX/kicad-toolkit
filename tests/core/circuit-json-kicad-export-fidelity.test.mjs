// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import * as nodeApi from '../../src/node.mjs'
import * as parserApi from '../../src/parser.mjs'

const {
    CircuitJsonKicadLibraryExporter,
    CircuitJsonKicadProjectExporter,
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
 * Builds a component with explicit symbol and footprint metadata.
 * @returns {object[]}
 */
function metadataBoard() {
    return [
        {
            type: 'source_component',
            source_component_id: 'source_amp',
            name: 'U1',
            manufacturer_part_number: 'AMP-1',
            metadata: {
                kicad_symbol: {
                    name: 'Amplifier_A',
                    properties: {
                        Description: 'Low noise amplifier',
                        Datasheet: 'https://example.invalid/amp.pdf',
                        'Supplier Part Number': 'SPN-1'
                    }
                },
                kicad_footprint: {
                    name: 'Amplifier_QFN',
                    properties: {
                        Description: 'Board side QFN'
                    },
                    attributes: ['smd', 'exclude_from_pos_files'],
                    layer: 'bottom',
                    embeddedFonts: true,
                    models: [
                        {
                            path: '${KIPRJMOD}/shapes/amp.step',
                            offset: { x: 1, y: 2, z: 3 },
                            scale: { x: 1, y: 1, z: 0.5 },
                            rotate: { x: 0, y: 0, z: 90 }
                        }
                    ]
                }
            }
        },
        {
            type: 'source_port',
            source_port_id: 'source_amp_pin_1',
            source_component_id: 'source_amp',
            name: 'IN',
            pin_number: 1
        },
        {
            type: 'schematic_component',
            schematic_component_id: 'schematic_amp',
            source_component_id: 'source_amp',
            center: { x: 3, y: 4 }
        },
        {
            type: 'pcb_component',
            pcb_component_id: 'pcb_amp',
            source_component_id: 'source_amp',
            center: { x: 10, y: 5 },
            layer: 'top'
        },
        {
            type: 'pcb_smtpad',
            pcb_smtpad_id: 'pad_amp_1',
            pcb_component_id: 'pcb_amp',
            shape: 'rect',
            x: 10,
            y: 5,
            width: 1,
            height: 0.6
        }
    ]
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

test('CircuitJsonKicadProjectExporter preserves KiCad metadata on generated library items', () => {
    const result = CircuitJsonKicadProjectExporter.export(metadataBoard(), {
        projectName: 'Demo Metadata'
    })
    const symbolText = decodeEntry(
        findEntry(result, 'kicad/Demo_Metadata.kicad_sym')
    )
    const schematicText = decodeEntry(
        findEntry(result, 'kicad/Demo_Metadata.kicad_sch')
    )
    const footprintText = decodeEntry(
        findEntry(result, 'kicad/Demo_Metadata.pretty/Amplifier_QFN.kicad_mod')
    )

    assert.match(symbolText, /\(symbol "Amplifier_A"/)
    assert.match(symbolText, /\(property "Description" "Low noise amplifier"/)
    assert.match(
        symbolText,
        /\(property "Datasheet" "https:\/\/example\.invalid\/amp\.pdf"/
    )
    assert.match(symbolText, /\(property "Supplier Part Number" "SPN-1"/)
    assert.match(schematicText, /\(lib_id "Demo_Metadata:Amplifier_A"\)/)
    assert.match(
        schematicText,
        /\(property "Footprint" "Demo_Metadata:Amplifier_QFN"/
    )
    assert.match(footprintText, /\(footprint "Amplifier_QFN"/)
    assert.match(footprintText, /\(layer "B\.Cu"\)/)
    assert.match(footprintText, /\(property "Description" "Board side QFN"/)
    assert.match(footprintText, /\(attr smd exclude_from_pos_files\)/)
    assert.match(footprintText, /\(embedded_fonts yes\)/)
    assert.match(footprintText, /\(model "\$\{KIPRJMOD\}\/shapes\/amp\.step"/)
    assert.match(footprintText, /\(offset \(xyz 1 2 3\)\)/)
    assert.match(footprintText, /\(scale \(xyz 1 1 0\.5\)\)/)
    assert.match(footprintText, /\(rotate \(xyz 0 0 90\)\)/)
})

test('CircuitJsonKicadProjectExporter emits global labels and power symbols from schematic label metadata', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'schematic_net_label',
                schematic_net_label_id: 'label_bus',
                text: 'BUS_A',
                anchor_position: { x: 10, y: 20 },
                anchor_side: 'left'
            },
            {
                type: 'schematic_net_label',
                schematic_net_label_id: 'label_gnd',
                text: 'GND',
                symbol_name: 'GND',
                anchor_position: { x: 2, y: 3 },
                anchor_side: 'top'
            }
        ],
        { projectName: 'Labels' }
    )
    const schematicText = decodeEntry(
        findEntry(result, 'kicad/Labels.kicad_sch')
    )

    assert.match(schematicText, /\(global_label "BUS_A"/)
    assert.match(schematicText, /\(at 10 -20 180\)/)
    assert.match(schematicText, /\(justify right\)/)
    assert.doesNotMatch(schematicText, /\(label "BUS_A"/)
    assert.match(schematicText, /\(symbol\s+\(lib_id "power:GND"\)/)
    assert.match(schematicText, /\(property "Value" "GND"/)
    assert.doesNotMatch(schematicText, /\(global_label "GND"/)
})

test('CircuitJsonKicadLibraryExporter classifies, deduplicates, and rewrites packaged libraries', () => {
    const result = CircuitJsonKicadLibraryExporter.export(
        [
            ...packagedComponent('source_a', 'pcb_a', {
                symbolName: 'OpAmp',
                footprintName: 'OpAmp_SOIC'
            }),
            ...packagedComponent('source_b', 'pcb_b', {
                symbolName: 'OpAmp',
                footprintName: 'OpAmp_SOIC'
            }),
            ...packagedComponent('source_builtin', 'pcb_builtin', {
                symbolName: 'R',
                symbolLibraryName: 'Device',
                symbolBuiltin: true,
                footprintName: 'R_0603',
                footprintLibraryName: 'Resistor_SMD',
                footprintBuiltin: true
            })
        ],
        {
            libraryName: 'Analog Set',
            basePath: 'pkg',
            includeBuiltins: false,
            dedupeLibraryItems: true,
            packageId: 'org.fake.parts'
        }
    )
    const paths = result.entries.map((entry) => entry.path)
    const symbolText = decodeEntry(
        findEntry(result, 'pkg/Analog_Set.kicad_sym')
    )
    const fpTable = KicadLibraryTableParser.parse(
        decodeEntry(findEntry(result, 'pkg/fp-lib-table'))
    )

    assert.deepEqual(
        paths.filter((path) => path.endsWith('.kicad_mod')),
        ['pkg/Analog_Set.pretty/OpAmp_SOIC.kicad_mod']
    )
    assert.equal(countMatches(symbolText, /\(symbol "OpAmp"/gu), 1)
    assert.doesNotMatch(symbolText, /\(symbol "R"/)
    assert.equal(
        fpTable.rows[0].uri,
        '${KICAD_USER_3RD_PARTY}/org.fake.parts/Analog_Set.pretty'
    )
    assert.deepEqual(result.manifest.package.symbols.local, [
        { name: 'OpAmp', libraryName: 'Analog_Set' }
    ])
    assert.deepEqual(result.manifest.package.symbols.builtin, [
        { name: 'R', libraryName: 'Device' }
    ])
    assert.deepEqual(result.manifest.package.footprints.local, [
        { name: 'OpAmp_SOIC', libraryName: 'Analog_Set' }
    ])
    assert.deepEqual(result.manifest.package.footprints.builtin, [
        { name: 'R_0603', libraryName: 'Resistor_SMD' }
    ])
})

test('CircuitJsonKicadProjectExporter supports KiCad-style model shape directories', () => {
    const result = CircuitJsonKicadProjectExporter.export(metadataBoard(), {
        projectName: 'Shape Board',
        modelPathMode: 'library-shapes',
        modelFiles: [
            {
                name: 'body.step',
                sourcePath: 'models/body.step',
                bytes: new Uint8Array([1, 2, 3])
            }
        ]
    })
    const footprintText = decodeEntry(
        findEntry(result, 'kicad/Shape_Board.pretty/Amplifier_QFN.kicad_mod')
    )

    assert.deepEqual(
        [
            ...findEntry(
                result,
                'kicad/3dmodels/Shape_Board.3dshapes/body.step'
            ).bytes
        ],
        [1, 2, 3]
    )
    assert.match(
        footprintText,
        /\(model "\$\{KIPRJMOD\}\/3dmodels\/Shape_Board\.3dshapes\/body\.step"/
    )
    assert.equal(
        result.manifest.modelDirectory,
        '3dmodels/Shape_Board.3dshapes'
    )
})

test('KicadCliVisualSnapshotHarness is disabled by default', async () => {
    assert.equal(
        typeof nodeApi.KicadCliVisualSnapshotHarness?.render,
        'function'
    )

    const result = await nodeApi.KicadCliVisualSnapshotHarness.render({
        files: ['demo.kicad_sch']
    })

    assert.deepEqual(result, {
        skipped: true,
        reason: 'disabled',
        artifacts: [],
        commands: []
    })
})

test('KicadCliVisualSnapshotHarness runs KiCad CLI through an injected executor', async () => {
    const calls = []
    assert.equal(
        typeof nodeApi.KicadCliVisualSnapshotHarness?.render,
        'function'
    )

    const result = await nodeApi.KicadCliVisualSnapshotHarness.render({
        enabled: true,
        projectDir: '/tmp/project',
        outputDir: '/tmp/snapshots',
        files: ['demo.kicad_sch', 'demo.kicad_pcb'],
        render3d: true,
        /**
         * @param {string} command Command name.
         * @param {string[]} args Command arguments.
         * @returns {Promise<object>}
         */
        async execFile(command, args) {
            calls.push([command, args])
            return { stdout: '', stderr: '' }
        }
    })

    assert.equal(result.skipped, false)
    assert.deepEqual(calls, [
        [
            'kicad-cli',
            [
                'sch',
                'export',
                'svg',
                '--output',
                '/tmp/snapshots/demo.svg',
                '/tmp/project/demo.kicad_sch'
            ]
        ],
        [
            'kicad-cli',
            [
                'pcb',
                'export',
                'svg',
                '--output',
                '/tmp/snapshots/demo-pcb.svg',
                '/tmp/project/demo.kicad_pcb'
            ]
        ],
        [
            'kicad-cli',
            [
                'pcb',
                'render',
                '--output',
                '/tmp/snapshots/demo-3d.png',
                '/tmp/project/demo.kicad_pcb'
            ]
        ]
    ])
    assert.deepEqual(
        result.artifacts.map((artifact) => artifact.path),
        [
            '/tmp/snapshots/demo.svg',
            '/tmp/snapshots/demo-pcb.svg',
            '/tmp/snapshots/demo-3d.png'
        ]
    )
})

test('CircuitJsonKicadProjectExporter emits component-owned footprint artwork', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_art',
                name: 'U1',
                manufacturer_part_number: 'ART-1'
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_art',
                source_component_id: 'source_art',
                center: { x: 10, y: 10 },
                layer: 'top'
            },
            {
                type: 'pcb_smtpad',
                pcb_smtpad_id: 'pad_art_1',
                pcb_component_id: 'pcb_art',
                shape: 'rect',
                x: 10,
                y: 10,
                width: 1,
                height: 0.6
            },
            {
                type: 'pcb_silkscreen_text',
                pcb_silkscreen_text_id: 'silk_ref',
                pcb_component_id: 'pcb_art',
                text: 'U1',
                anchor_position: { x: 10, y: 8 },
                font_size: 1
            },
            {
                type: 'pcb_note_text',
                pcb_note_text_id: 'note_lock',
                pcb_component_id: 'pcb_art',
                text: 'LOCK',
                anchor_position: { x: 11, y: 10 },
                font_size: 0.8
            },
            {
                type: 'pcb_silkscreen_path',
                pcb_silkscreen_path_id: 'silk_path',
                pcb_component_id: 'pcb_art',
                route: [
                    { x: 9, y: 9 },
                    { x: 11, y: 9 },
                    { x: 11, y: 11 }
                ],
                stroke_width: 0.12
            },
            {
                type: 'pcb_silkscreen_circle',
                pcb_silkscreen_circle_id: 'silk_circle',
                pcb_component_id: 'pcb_art',
                center: { x: 10, y: 12 },
                radius: 0.5,
                stroke_width: 0.05
            },
            {
                type: 'pcb_fabrication_note_rect',
                pcb_fabrication_note_rect_id: 'fab_rect',
                pcb_component_id: 'pcb_art',
                center: { x: 12, y: 10 },
                width: 2,
                height: 1,
                stroke_width: 0.1
            },
            {
                type: 'pcb_note_rect',
                pcb_note_rect_id: 'note_rect',
                pcb_component_id: 'pcb_art',
                center: { x: 8, y: 10 },
                width: 1,
                height: 2,
                stroke_width: 0.11
            },
            {
                type: 'pcb_courtyard_circle',
                pcb_courtyard_circle_id: 'cty_circle',
                pcb_component_id: 'pcb_art',
                center: { x: 10, y: 7 },
                radius: 1
            },
            {
                type: 'pcb_courtyard_rect',
                pcb_courtyard_rect_id: 'cty_rect',
                pcb_component_id: 'pcb_art',
                center: { x: 13, y: 10 },
                width: 2,
                height: 2
            },
            {
                type: 'pcb_courtyard',
                pcb_courtyard_id: 'cty_generic',
                pcb_component_id: 'pcb_art',
                center: { x: 7, y: 10 },
                width: 1,
                height: 1
            },
            {
                type: 'pcb_courtyard_outline',
                pcb_courtyard_outline_id: 'cty_poly',
                pcb_component_id: 'pcb_art',
                points: [
                    { x: 8, y: 8 },
                    { x: 9, y: 8 },
                    { x: 9, y: 9 },
                    { x: 8, y: 9 }
                ]
            }
        ],
        { projectName: 'Artwork Footprint' }
    )
    const footprintText = decodeEntry(
        findEntry(result, 'kicad/Artwork_Footprint.pretty/U1.kicad_mod')
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Artwork_Footprint.kicad_pcb')
    )

    assert.match(footprintText, /\(fp_text reference "U1"/)
    assert.match(footprintText, /\(fp_text user "LOCK"/)
    assert.equal(countMatches(footprintText, /\(fp_line /gu), 2)
    assert.match(footprintText, /\(fp_circle .*?\(layer "F\.SilkS"\)/)
    assert.match(footprintText, /\(fp_circle .*?\(layer "F\.CrtYd"\)/)
    assert.match(footprintText, /\(fp_rect .*?\(layer "F\.Fab"\)/)
    assert.match(footprintText, /\(fp_rect .*?\(layer "F\.CrtYd"\)/)
    assert.match(footprintText, /\(fp_poly .*?\(layer "F\.CrtYd"\)/)
    assert.doesNotMatch(footprintText, /\(stroke \(width 2\)/)
    assert.match(pcbText, /\(fp_text user "LOCK"/)
})

test('CircuitJsonKicadProjectExporter emits custom schematic symbol primitives and port direction', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_cmp',
                name: 'U1',
                manufacturer_part_number: 'CMP-1'
            },
            {
                type: 'source_port',
                source_port_id: 'source_cmp_pin_1',
                source_component_id: 'source_cmp',
                name: 'IN',
                pin_number: 1
            },
            {
                type: 'source_port',
                source_port_id: 'source_cmp_pin_2',
                source_component_id: 'source_cmp',
                name: 'OUT',
                pin_number: 2
            },
            {
                type: 'schematic_component',
                schematic_component_id: 'schematic_cmp',
                source_component_id: 'source_cmp',
                schematic_symbol_id: 'symbol_cmp',
                center: { x: 20, y: 20 }
            },
            {
                type: 'schematic_symbol',
                schematic_symbol_id: 'symbol_cmp',
                name: 'ComparatorSymbol',
                center: { x: 20, y: 20 },
                width: 8,
                height: 6
            },
            {
                type: 'schematic_port',
                schematic_port_id: 'schematic_cmp_pin_1',
                schematic_component_id: 'schematic_cmp',
                schematic_symbol_id: 'symbol_cmp',
                source_port_id: 'source_cmp_pin_1',
                display_pin_label: 'IN+',
                pin_number: 1,
                center: { x: 16, y: 20 },
                facing_direction: 'left'
            },
            {
                type: 'schematic_port',
                schematic_port_id: 'schematic_cmp_pin_2',
                schematic_component_id: 'schematic_cmp',
                schematic_symbol_id: 'symbol_cmp',
                source_port_id: 'source_cmp_pin_2',
                display_pin_label: 'OUT',
                pin_number: 2,
                center: { x: 24, y: 20 },
                facing_direction: 'right'
            },
            {
                type: 'schematic_path',
                schematic_path_id: 'symbol_cmp_outline',
                schematic_symbol_id: 'symbol_cmp',
                points: [
                    { x: 16, y: 17 },
                    { x: 24, y: 20 },
                    { x: 16, y: 23 },
                    { x: 16, y: 17 }
                ],
                stroke_width: 0.15
            },
            {
                type: 'schematic_circle',
                schematic_circle_id: 'symbol_cmp_bubble',
                schematic_symbol_id: 'symbol_cmp',
                center: { x: 18, y: 20 },
                radius: 0.5,
                stroke_width: 0.1
            },
            {
                type: 'schematic_line',
                schematic_line_id: 'symbol_cmp_inner',
                schematic_component_id: 'schematic_cmp',
                x1: 19,
                y1: 18,
                x2: 21,
                y2: 22,
                stroke_width: 0.1
            }
        ],
        { projectName: 'Custom Symbol' }
    )
    const symbolText = decodeEntry(
        findEntry(result, 'kicad/Custom_Symbol.kicad_sym')
    )
    const schematicText = decodeEntry(
        findEntry(result, 'kicad/Custom_Symbol.kicad_sch')
    )

    assert.match(symbolText, /\(symbol "ComparatorSymbol"/)
    assert.match(symbolText, /\(polyline /)
    assert.match(symbolText, /\(circle /)
    assert.match(symbolText, /\(pin passive line \(at -4 0 0\)/)
    assert.match(symbolText, /\(pin passive line \(at 4 0 180\)/)
    assert.match(symbolText, /\(name "IN\+"/)
    assert.match(symbolText, /\(number "2"/)
    assert.match(schematicText, /\(lib_id "Custom_Symbol:ComparatorSymbol"\)/)
})

test('CircuitJsonKicadProjectExporter accounts for board thickness in model offsets and source pin numbers', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'pcb_board',
                pcb_board_id: 'board_1',
                center: { x: 5, y: 5 },
                width: 20,
                height: 20,
                thickness: 1.6
            },
            {
                type: 'source_component',
                source_component_id: 'source_model',
                name: 'U1',
                manufacturer_part_number: 'MODEL-1'
            },
            {
                type: 'source_port',
                source_port_id: 'source_model_pin_7',
                source_component_id: 'source_model',
                name: 'IO',
                pin_number: 7
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_model',
                source_component_id: 'source_model',
                center: { x: 5, y: 5 },
                layer: 'top'
            },
            {
                type: 'pcb_port',
                pcb_port_id: 'pcb_model_pin_7',
                pcb_component_id: 'pcb_model',
                source_port_id: 'source_model_pin_7',
                x: 5,
                y: 5
            },
            {
                type: 'pcb_plated_hole',
                pcb_plated_hole_id: 'hole_model_7',
                pcb_component_id: 'pcb_model',
                pcb_port_id: 'pcb_model_pin_7',
                shape: 'circular_hole_with_rect_pad',
                x: 5,
                y: 5,
                hole_diameter: 0.4,
                outer_diameter: 1
            },
            {
                type: 'cad_component',
                cad_component_id: 'cad_model',
                pcb_component_id: 'pcb_model',
                model_step_url: 'models/top.step',
                position: { x: 5, y: 5, z: 1.2 },
                model_origin_position: { x: 0, y: 0, z: 0.1 }
            }
        ],
        {
            projectName: 'Physical Models',
            modelFiles: [
                {
                    name: 'top.step',
                    sourcePath: 'models/top.step',
                    bytes: new Uint8Array([1, 2, 3])
                }
            ]
        }
    )
    const footprintText = decodeEntry(
        findEntry(result, 'kicad/Physical_Models.pretty/U1.kicad_mod')
    )

    assert.match(footprintText, /\(pad "7" thru_hole rect/)
    assert.match(
        footprintText,
        /\(model "\$\{KIPRJMOD\}\/models\/top\.step" \(offset \(xyz 0 0 0\.3\)\)/
    )
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
                    libraryName: options.symbolLibraryName,
                    isBuiltin: options.symbolBuiltin === true
                },
                kicad_footprint: {
                    name: options.footprintName,
                    libraryName: options.footprintLibraryName,
                    isBuiltin: options.footprintBuiltin === true
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
