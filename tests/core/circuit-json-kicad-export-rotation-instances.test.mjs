// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    CircuitJsonKicadProjectExporter,
    KicadSchematicParser
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

test('CircuitJsonKicadProjectExporter rotates footprint pad positions into footprint-local coordinates', () => {
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
                center: { x: 10, y: 5 },
                rotation: 90,
                layer: 'top'
            },
            {
                type: 'pcb_smtpad',
                pcb_smtpad_id: 'pad_u1_1',
                pcb_component_id: 'pcb_u1',
                x: 11,
                y: 5,
                width: 1,
                height: 1,
                shape: 'rect',
                number: 1
            },
            {
                type: 'pcb_silkscreen_line',
                pcb_silkscreen_line_id: 'line_u1_1',
                pcb_component_id: 'pcb_u1',
                x1: 10,
                y1: 5,
                x2: 11,
                y2: 5,
                layer: 'top'
            }
        ],
        { projectName: 'Rotated Pads' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Rotated_Pads.kicad_pcb')
    )

    assert.match(
        pcbText,
        /\(footprint "Rotated_Pads:U1"[\s\S]*?\(at 10 -5 90\)/
    )
    assert.match(pcbText, /\(pad "1" smd rect \(at 0 1 0\)/)
    assert.match(pcbText, /\(fp_line\s+\(start 0 0\)\s+\(end 0 1\)/)
    assert.doesNotMatch(pcbText, /\(pad "1" smd rect \(at 1 0 0\)/)
})

test('CircuitJsonKicadProjectExporter emits deterministic symbol instance paths', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_u1',
                name: 'U1',
                manufacturer_part_number: 'FakeLogic-1'
            },
            {
                type: 'schematic_component',
                schematic_component_id: 'schematic_u1',
                source_component_id: 'source_u1',
                center: { x: 2, y: 3 }
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_u1',
                source_component_id: 'source_u1',
                center: { x: 0, y: 0 }
            }
        ],
        { projectName: 'Symbol Instances' }
    )
    const schematicText = decodeEntry(
        findEntry(result, 'kicad/Symbol_Instances.kicad_sch')
    )
    const parsed = KicadSchematicParser.parse(schematicText)

    assert.match(
        schematicText,
        /\(symbol_instances\s+\(path "\/[0-9a-f-]+" \(reference "U1"\) \(unit 1\) \(value "FakeLogic-1"\) \(footprint "Symbol_Instances:U1"\)\)\)/
    )
    assert.deepEqual(parsed.schematic.symbolInstances, [
        {
            path: parsed.schematic.symbolInstances[0].path,
            reference: 'U1',
            unit: 1,
            value: 'FakeLogic-1',
            footprint: 'Symbol_Instances:U1'
        }
    ])
    assert.match(parsed.schematic.symbolInstances[0].path, /^\/[0-9a-f-]+$/u)
})

test('CircuitJsonKicadProjectExporter preserves custom symbol pin sides and lengths', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        customSymbolPinElements(),
        { projectName: 'Symbol Pin Geometry' }
    )
    const schematicText = decodeEntry(
        findEntry(result, 'kicad/Symbol_Pin_Geometry.kicad_sch')
    )

    assert.match(
        schematicText,
        /\(pin passive line \(at -5 0 0\) \(length 3\.81\) \(name "LEFT"\) \(number "1"\)\)/
    )
    assert.match(
        schematicText,
        /\(pin passive line \(at 5 0 180\) \(length 3\.81\) \(name "RIGHT"\) \(number "2"\)\)/
    )
    assert.match(
        schematicText,
        /\(pin passive line \(at 0 5 270\) \(length 3\.81\) \(name "TOP"\) \(number "3"\)\)/
    )
    assert.match(
        schematicText,
        /\(pin passive line \(at 0 -5 90\) \(length 3\.81\) \(name "BOTTOM"\) \(number "4"\)\)/
    )
})

/**
 * Builds fake custom-symbol rows with pins on each body side.
 * @returns {object[]}
 */
function customSymbolPinElements() {
    return [
        {
            type: 'source_component',
            source_component_id: 'source_u1',
            name: 'U1'
        },
        ...[1, 2, 3, 4].map((pinNumber) => ({
            type: 'source_port',
            source_port_id: 'source_u1_pin_' + pinNumber,
            source_component_id: 'source_u1',
            pin_number: pinNumber,
            name: 'P' + pinNumber
        })),
        {
            type: 'schematic_component',
            schematic_component_id: 'schematic_u1',
            source_component_id: 'source_u1',
            center: { x: 10, y: 10 }
        },
        {
            type: 'schematic_symbol',
            schematic_symbol_id: 'symbol_u1',
            name: 'DirectionalBody',
            center: { x: 10, y: 10 },
            width: 10,
            height: 10
        },
        {
            type: 'schematic_rect',
            schematic_rect_id: 'body_u1',
            schematic_symbol_id: 'symbol_u1',
            schematic_component_id: 'schematic_u1',
            center: { x: 10, y: 10 },
            width: 10,
            height: 10
        },
        ...customSymbolPins()
    ]
}

/**
 * Builds fake custom-symbol schematic ports.
 * @returns {object[]}
 */
function customSymbolPins() {
    return [
        ['left', 1, 'LEFT', { x: 5, y: 10 }],
        ['right', 2, 'RIGHT', { x: 15, y: 10 }],
        ['top', 3, 'TOP', { x: 10, y: 5 }],
        ['bottom', 4, 'BOTTOM', { x: 10, y: 15 }]
    ].map(([side, pinNumber, label, center]) => ({
        type: 'schematic_port',
        schematic_port_id: 'port_' + side,
        schematic_symbol_id: 'symbol_u1',
        schematic_component_id: 'schematic_u1',
        source_port_id: 'source_u1_pin_' + pinNumber,
        pin_number: pinNumber,
        display_pin_label: label,
        center,
        facing_direction: side,
        pin_length: 3.81
    }))
}
