// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { CircuitJsonKicadProjectExporter } from '../../src/parser.mjs'

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

test('CircuitJsonKicadProjectExporter scales schematic coordinates when enabled', () => {
    const defaultResult = CircuitJsonKicadProjectExporter.export(
        scaledFixture(),
        { projectName: 'Scaled Schematic' }
    )
    const scaledResult = CircuitJsonKicadProjectExporter.export(
        scaledFixture(),
        {
            projectName: 'Scaled Schematic',
            schematicScaleFactor: 10
        }
    )
    const defaultSchematic = decodeEntry(
        findEntry(defaultResult, 'kicad/Scaled_Schematic.kicad_sch')
    )
    const scaledSchematic = decodeEntry(
        findEntry(scaledResult, 'kicad/Scaled_Schematic.kicad_sch')
    )
    const scaledSymbols = decodeEntry(
        findEntry(scaledResult, 'kicad/Scaled_Schematic.kicad_sym')
    )

    assert.match(defaultSchematic, /\(symbol[\s\S]*?\(at 1 -2 0\)/)
    assert.match(defaultSchematic, /\(wire\s+\(pts\s+\(xy 1 0\)\s+\(xy 2 0\)\)/)
    assert.match(scaledSchematic, /\(symbol[\s\S]*?\(at 10 -20 0\)/)
    assert.match(
        scaledSchematic,
        /\(wire\s+\(pts\s+\(xy 10 0\)\s+\(xy 20 0\)\)/
    )
    assert.match(scaledSchematic, /\(global_label "SIG"[\s\S]*?\(at 30 -40 0\)/)
    assert.match(scaledSchematic, /\(text "Fake note"[\s\S]*?\(at 40 -50 0\)/)
    assert.match(
        scaledSchematic,
        /\(polyline\s+\(pts\s+\(xy 0 0\)\s+\(xy 0 -10\)\)/
    )
    assert.match(
        scaledSchematic,
        /\(rectangle\s+\(start 45 -12\.5\)\s+\(end 55 -7\.5\)/
    )
    assert.match(
        scaledSymbols,
        /\(polyline\s+\(pts\s+\(xy -10 10\)\s+\(xy 10 10\)\)/
    )
    assert.match(
        scaledSymbols,
        /\(pin passive line\s+\(at -10 0 0\)\s+\(length 3\)/
    )
})

test('CircuitJsonKicadProjectExporter can center scaled schematics on the page', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'schematic_line',
                schematic_line_id: 'line_centered',
                x1: 0,
                y1: 0,
                x2: 2,
                y2: 2
            }
        ],
        {
            projectName: 'Centered Schematic',
            schematicScaleFactor: 10,
            schematicCenterOnPage: true
        }
    )
    const schematic = decodeEntry(
        findEntry(result, 'kicad/Centered_Schematic.kicad_sch')
    )

    assert.match(schematic, /\(paper "A4"\)/)
    assert.match(
        schematic,
        /\(wire\s+\(pts\s+\(xy 138\.5 115\)\s+\(xy 158\.5 95\)\)/
    )
})

/**
 * Builds a fake schematic with page-level and symbol-local geometry.
 * @returns {object[]}
 */
function scaledFixture() {
    return [
        {
            type: 'source_component',
            source_component_id: 'source_u1',
            name: 'U1'
        },
        {
            type: 'source_port',
            source_port_id: 'source_u1_port_1',
            source_component_id: 'source_u1',
            name: 'IN',
            pin_number: 1
        },
        {
            type: 'schematic_component',
            schematic_component_id: 'schematic_u1',
            source_component_id: 'source_u1',
            schematic_symbol_id: 'symbol_u1',
            center: { x: 1, y: 2 },
            size: { width: 2, height: 2 }
        },
        {
            type: 'schematic_symbol',
            schematic_symbol_id: 'symbol_u1',
            center: { x: 1, y: 2 },
            width: 2,
            height: 2
        },
        {
            type: 'schematic_port',
            schematic_port_id: 'port_u1_1',
            source_port_id: 'source_u1_port_1',
            schematic_symbol_id: 'symbol_u1',
            center: { x: 0, y: 2 },
            facing_direction: 'left',
            pin_length: 0.3
        },
        {
            type: 'schematic_line',
            schematic_line_id: 'symbol_line',
            schematic_symbol_id: 'symbol_u1',
            x1: 0,
            y1: 1,
            x2: 2,
            y2: 1
        },
        {
            type: 'schematic_line',
            schematic_line_id: 'wire_main',
            x1: 1,
            y1: 0,
            x2: 2,
            y2: 0
        },
        {
            type: 'schematic_net_label',
            schematic_net_label_id: 'label_sig',
            text: 'SIG',
            anchor_position: { x: 3, y: 4 }
        },
        {
            type: 'schematic_text',
            schematic_text_id: 'note_main',
            text: 'Fake note',
            position: { x: 4, y: 5 }
        },
        {
            type: 'schematic_line',
            schematic_line_id: 'page_rule',
            is_page_graphic: true,
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 1
        },
        {
            type: 'schematic_rect',
            schematic_rect_id: 'page_rect',
            center: { x: 5, y: 1 },
            width: 1,
            height: 0.5
        }
    ]
}
