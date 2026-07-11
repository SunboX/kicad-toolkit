// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    CircuitJsonKicadProjectExporter,
    CircuitJsonKicadProjectModelResolver
} from '../../src/legacy-parser.mjs'

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

test('CircuitJsonKicadProjectExporter emits symbol stem lines from schematic port stem hints', () => {
    const result = CircuitJsonKicadProjectExporter.export(portStemBoard(), {
        projectName: 'Stem Hints'
    })
    const symbolText = decodeEntry(
        findEntry(result, 'kicad/Stem_Hints.kicad_sym')
    )

    assert.match(
        symbolText,
        /\(polyline\s+\(pts\s+\(xy -5 1\)\s+\(xy -2\.5 1\)\)[\s\S]*?\(stroke \(width 0\.12\)/
    )
    assert.match(
        symbolText,
        /\(polyline\s+\(pts\s+\(xy 5 -1\)\s+\(xy 3 -1\)\)[\s\S]*?\(stroke \(width 0\.15\)/
    )
    assert.match(
        symbolText,
        /\(pin passive line \(at -5 1 0\) \(length 2\.54\) \(name "IN"\) \(number "1"\)\)/
    )
    assert.match(
        symbolText,
        /\(pin passive line \(at 5 -1 180\) \(length 2\.54\) \(name "OUT"\) \(number "2"\)\)/
    )
})

test('CircuitJsonKicadProjectExporter derives anonymous standalone footprint names from pad geometry', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        standaloneGeometryBoard(),
        { projectName: 'Board Geometry' }
    )
    const paths = result.entries.map((entry) => entry.path)
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Board_Geometry.kicad_pcb')
    )

    assert.ok(
        paths.includes(
            'kicad/Board_Geometry.pretty/NPTH_Oval_Drill_1x2_R45.kicad_mod'
        )
    )
    assert.ok(
        paths.includes(
            'kicad/Board_Geometry.pretty/PTH_Rect_1_6x1_Drill_0_6_R30.kicad_mod'
        )
    )
    assert.ok(paths.includes('kicad/Board_Geometry.pretty/fid_1.kicad_mod'))
    assert.match(
        pcbText,
        /\(footprint "Board_Geometry:NPTH_Oval_Drill_1x2_R45"/
    )
    assert.match(
        pcbText,
        /\(footprint "Board_Geometry:PTH_Rect_1_6x1_Drill_0_6_R30"/
    )
    assert.match(pcbText, /\(footprint "Board_Geometry:fid_1"/)
})

test('CircuitJsonKicadProjectModelResolver routes model sources by generic rules', async () => {
    const result = await CircuitJsonKicadProjectModelResolver.resolve({
        model3dSourcePaths: [
            'https://assets.example/shared/body.step',
            'local/body.step'
        ],
        modelDirectory: 'models/default',
        modelSourceRules: [
            {
                match: 'https://assets.example/shared/',
                modelDirectory: '3dmodels/shared.3dshapes',
                modelPathPrefix: '${KIPRJMOD}/3dmodels/shared.3dshapes/'
            }
        ],
        /**
         * @returns {Promise<object>}
         */
        async fetch() {
            return {
                ok: true,
                /**
                 * @returns {Promise<ArrayBuffer>}
                 */
                async arrayBuffer() {
                    return new Uint8Array([1, 2, 3]).buffer
                }
            }
        },
        /**
         * @returns {Promise<Uint8Array>}
         */
        async readFile() {
            return new Uint8Array([4, 5, 6])
        }
    })

    assert.deepEqual(
        result.modelFiles.map((model) => ({
            name: model.name,
            sourcePath: model.sourcePath,
            outputPath: model.outputPath,
            modelPath: model.modelPath || '',
            bytes: [...model.bytes]
        })),
        [
            {
                name: 'body.step',
                sourcePath: 'https://assets.example/shared/body.step',
                outputPath: '3dmodels/shared.3dshapes/body.step',
                modelPath: '${KIPRJMOD}/3dmodels/shared.3dshapes/body.step',
                bytes: [1, 2, 3]
            },
            {
                name: 'body.step',
                sourcePath: 'local/body.step',
                outputPath: 'models/default/body.step',
                modelPath: '',
                bytes: [4, 5, 6]
            }
        ]
    )
    assert.equal(result.summary.sourcePathCount, 2)
    assert.equal(result.summary.loadedCount, 2)
})

test('CircuitJsonKicadProjectExporter writes routed model files and references output paths', () => {
    const result = CircuitJsonKicadProjectExporter.export(routedModelBoard(), {
        projectName: 'Routed Models',
        modelSourceRules: [
            {
                match: /^https:\/\/assets\.example\/shared\//u,
                modelDirectory: '3dmodels/shared.3dshapes'
            }
        ],
        modelFiles: [
            {
                sourcePath: 'https://assets.example/shared/body.step',
                bytes: new Uint8Array([7, 8, 9]),
                format: 'step'
            }
        ]
    })
    const footprintText = decodeEntry(
        findEntry(result, 'kicad/Routed_Models.pretty/U1.kicad_mod')
    )

    assert.deepEqual(
        [
            ...findEntry(result, 'kicad/3dmodels/shared.3dshapes/body.step')
                .bytes
        ],
        [7, 8, 9]
    )
    assert.match(
        footprintText,
        /\(model "\$\{KIPRJMOD\}\/3dmodels\/shared\.3dshapes\/body\.step"/
    )
    assert.deepEqual(result.manifest.modelDirectories, [
        '3dmodels/shared.3dshapes'
    ])
})

/**
 * Builds fake custom-symbol rows with two ports that request body stems.
 * @returns {object[]}
 */
function portStemBoard() {
    return [
        {
            type: 'source_component',
            source_component_id: 'source_u1',
            name: 'U1'
        },
        {
            type: 'source_port',
            source_port_id: 'source_u1_pin_1',
            source_component_id: 'source_u1',
            pin_number: 1,
            name: 'IN'
        },
        {
            type: 'source_port',
            source_port_id: 'source_u1_pin_2',
            source_component_id: 'source_u1',
            pin_number: 2,
            name: 'OUT'
        },
        {
            type: 'schematic_component',
            schematic_component_id: 'schematic_u1',
            source_component_id: 'source_u1',
            schematic_symbol_id: 'symbol_u1',
            center: { x: 10, y: 10 }
        },
        {
            type: 'schematic_symbol',
            schematic_symbol_id: 'symbol_u1',
            name: 'StemBody',
            center: { x: 10, y: 10 },
            width: 10,
            height: 6
        },
        {
            type: 'schematic_rect',
            schematic_rect_id: 'body_u1',
            schematic_symbol_id: 'symbol_u1',
            center: { x: 10, y: 10 },
            width: 6,
            height: 4
        },
        {
            type: 'schematic_port',
            schematic_port_id: 'schematic_u1_pin_1',
            schematic_symbol_id: 'symbol_u1',
            source_port_id: 'source_u1_pin_1',
            pin_number: 1,
            display_pin_label: 'IN',
            center: { x: 5, y: 9 },
            facing_direction: 'left',
            sch_stem_length: 2.5,
            stem_width: 0.12
        },
        {
            type: 'schematic_port',
            schematic_port_id: 'schematic_u1_pin_2',
            schematic_symbol_id: 'symbol_u1',
            source_port_id: 'source_u1_pin_2',
            pin_number: 2,
            display_pin_label: 'OUT',
            center: { x: 15, y: 11 },
            facing_direction: 'right',
            schStemLength: 2
        }
    ]
}

/**
 * Builds fake board-owned pad and hole rows for standalone footprint naming.
 * @returns {object[]}
 */
function standaloneGeometryBoard() {
    return [
        {
            type: 'pcb_board',
            pcb_board_id: 'board_1',
            center: { x: 0, y: 0 },
            width: 16,
            height: 10
        },
        {
            type: 'pcb_hole',
            hole_shape: 'pill',
            x: -3,
            y: 0,
            hole_width: 1,
            hole_height: 2,
            ccw_rotation: 45
        },
        {
            type: 'pcb_plated_hole',
            shape: 'circular_hole_with_rect_pad',
            x: 3,
            y: 0,
            hole_diameter: 0.6,
            rect_pad_width: 1.6,
            rect_pad_height: 1,
            rect_ccw_rotation: 30
        },
        {
            type: 'pcb_smtpad',
            pcb_smtpad_id: 'fid_1',
            shape: 'circle',
            x: 0,
            y: 3,
            diameter: 1
        }
    ]
}

/**
 * Builds a fake component that references one routed 3D model source.
 * @returns {object[]}
 */
function routedModelBoard() {
    return [
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
            pcb_smtpad_id: 'pad_u1',
            pcb_component_id: 'pcb_u1',
            shape: 'rect',
            x: 0,
            y: 0,
            width: 1,
            height: 1
        },
        {
            type: 'cad_component',
            cad_component_id: 'cad_u1',
            pcb_component_id: 'pcb_u1',
            model_step_url: 'https://assets.example/shared/body.step',
            position: { x: 0, y: 0, z: 0 }
        }
    ]
}
