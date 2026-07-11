// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    CircuitJsonKicadProjectExporter,
    KicadPcbParser,
    KicadSchematicParser
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

test('CircuitJsonKicadProjectExporter rotates drill offsets with footprint rotation', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_j1',
                name: 'J1'
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_j1',
                source_component_id: 'source_j1',
                center: { x: 10, y: 5 },
                rotation: 90,
                layer: 'top'
            },
            {
                type: 'pcb_plated_hole',
                pcb_plated_hole_id: 'hole_j1_1',
                pcb_component_id: 'pcb_j1',
                x: 10,
                y: 5,
                outer_diameter: 1.4,
                hole_diameter: 0.8,
                hole_offset_x: 0.2,
                hole_offset_y: 0,
                shape: 'circle',
                number: 1
            }
        ],
        { projectName: 'Rotated Drill Offset' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Rotated_Drill_Offset.kicad_pcb')
    )

    assert.match(
        pcbText,
        /\(pad "1" thru_hole circle[\s\S]*?\(drill 0\.8 \(offset 0 -0\.2\)\)/
    )
    assert.doesNotMatch(pcbText, /\(drill 0\.8 \(offset -0\.2 0\)\)/)
})

test('CircuitJsonKicadProjectExporter emits type-aware default component metadata', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_resistor',
                ftype: 'simple_resistor',
                display_resistance: '4.7k',
                kicad_footprint: { name: 'Typed_R_0603' }
            },
            {
                type: 'source_component',
                source_component_id: 'source_capacitor',
                ftype: 'simple_capacitor',
                display_capacitance: '100nF'
            },
            {
                type: 'source_component',
                source_component_id: 'source_inductor',
                ftype: 'simple_inductor',
                display_inductance: '2.2uH'
            },
            {
                type: 'source_component',
                source_component_id: 'source_led',
                ftype: 'simple_led'
            },
            {
                type: 'source_component',
                source_component_id: 'source_diode',
                ftype: 'simple_diode'
            },
            {
                type: 'source_component',
                source_component_id: 'source_switch',
                ftype: 'simple_switch'
            },
            {
                type: 'source_component',
                source_component_id: 'source_potentiometer',
                ftype: 'simple_potentiometer',
                display_max_resistance: '50k'
            },
            ...[
                ['resistor', 0],
                ['capacitor', 10],
                ['inductor', 20],
                ['led', 30],
                ['diode', 40],
                ['switch', 50],
                ['potentiometer', 60]
            ].map(([kind, x]) => ({
                type: 'schematic_component',
                schematic_component_id: 'schematic_' + kind,
                source_component_id: 'source_' + kind,
                center: { x, y: 0 }
            })),
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_resistor',
                source_component_id: 'source_resistor',
                center: { x: 0, y: 0 },
                layer: 'top'
            }
        ],
        { projectName: 'Typed Defaults' }
    )
    const schematicText = decodeEntry(
        findEntry(result, 'kicad/Typed_Defaults.kicad_sch')
    )
    const footprintText = decodeEntry(
        findEntry(result, 'kicad/Typed_Defaults.pretty/Typed_R_0603.kicad_mod')
    )
    const parsed = KicadSchematicParser.parse(schematicText)
    const instancePairs = parsed.schematic.symbolInstances.map((instance) => ({
        reference: instance.reference,
        value: instance.value
    }))
    const valuesByReference = new Map(
        instancePairs.map((instance) => [instance.reference, instance.value])
    )

    assert.equal(valuesByReference.get('R'), '4.7k')
    assert.equal(valuesByReference.get('C'), '100nF')
    assert.equal(valuesByReference.get('L'), '2.2uH')
    assert.ok(
        instancePairs.some(
            (instance) => instance.reference === 'D' && instance.value === 'LED'
        )
    )
    assert.ok(
        instancePairs.some(
            (instance) => instance.reference === 'D' && instance.value === 'D'
        )
    )
    assert.equal(valuesByReference.get('SW'), 'SW')
    assert.equal(valuesByReference.get('RV'), '50k')
    assert.match(footprintText, /\(property "Reference" "R"/)
    assert.match(footprintText, /\(property "Value" "4\.7k"/)
})

test('CircuitJsonKicadProjectExporter emits pad-level local policy overrides', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_u2',
                name: 'U2'
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_u2',
                source_component_id: 'source_u2',
                center: { x: 0, y: 0 },
                layer: 'top'
            },
            {
                type: 'pcb_smtpad',
                pcb_smtpad_id: 'pad_u2_1',
                pcb_component_id: 'pcb_u2',
                x: 1,
                y: 2,
                width: 1.4,
                height: 0.8,
                shape: 'rect',
                number: 1,
                solderMaskMargin: 0.05,
                solder_paste_margin: -0.02,
                solder_paste_margin_ratio: -0.1,
                clearance: 0.15,
                zoneConnect: 2,
                thermalBridgeWidth: 0.35,
                thermalBridgeAngle: 45,
                thermalGap: 0.22
            }
        ],
        { projectName: 'Pad Policies' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Pad_Policies.kicad_pcb')
    )
    const parsed = KicadPcbParser.parse(pcbText, {
        fileName: 'Pad_Policies.kicad_pcb'
    })
    const pad = parsed.pads.find((entry) => entry.number === '1')

    assert.match(pcbText, /\(solder_mask_margin 0\.05\)/)
    assert.match(pcbText, /\(solder_paste_margin -0\.02\)/)
    assert.match(pcbText, /\(solder_paste_margin_ratio -0\.1\)/)
    assert.match(pcbText, /\(clearance 0\.15\)/)
    assert.match(pcbText, /\(zone_connect 2\)/)
    assert.match(pcbText, /\(thermal_bridge_width 0\.35\)/)
    assert.match(pcbText, /\(thermal_bridge_angle 45\)/)
    assert.match(pcbText, /\(thermal_gap 0\.22\)/)
    assert.ok(pad)
    assert.equal(pad.solderMaskMargin, 0.05)
    assert.equal(pad.solderPasteMargin, -0.02)
    assert.equal(pad.solderPasteMarginRatio, -0.1)
    assert.equal(pad.clearance, 0.15)
    assert.equal(pad.zoneConnect, 2)
    assert.equal(pad.thermalBridgeWidth, 0.35)
    assert.equal(pad.thermalBridgeAngle, 45)
    assert.equal(pad.thermalGap, 0.22)
})

test('CircuitJsonKicadProjectExporter converts read-model pad policy lengths to millimeters', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_u3',
                name: 'U3'
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_u3',
                source_component_id: 'source_u3',
                center: { x: 0, y: 0 },
                layer: 'top'
            },
            {
                type: 'pcb_smtpad',
                pcb_smtpad_id: 'pad_u3_1',
                pcb_component_id: 'pcb_u3',
                x: 0,
                y: 0,
                width: 1,
                height: 1,
                shape: 'rect',
                number: 1,
                solderMaskExpansion: 2,
                pasteMaskExpansion: -1,
                powerPlaneClearance: 6,
                planeConnectionStyle: 1,
                thermalReliefConductorWidth: 14,
                thermalReliefAirGap: 9
            }
        ],
        { projectName: 'Pad Policy Units' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Pad_Policy_Units.kicad_pcb')
    )
    const parsed = KicadPcbParser.parse(pcbText, {
        fileName: 'Pad_Policy_Units.kicad_pcb'
    })
    const pad = parsed.pads.find((entry) => entry.number === '1')

    assert.match(pcbText, /\(solder_mask_margin 0\.0508\)/)
    assert.match(pcbText, /\(solder_paste_margin -0\.0254\)/)
    assert.match(pcbText, /\(clearance 0\.1524\)/)
    assert.match(pcbText, /\(zone_connect 1\)/)
    assert.match(pcbText, /\(thermal_bridge_width 0\.3556\)/)
    assert.match(pcbText, /\(thermal_gap 0\.2286\)/)
    assert.ok(pad)
    assert.equal(pad.solderMaskMargin, 0.0508)
    assert.equal(pad.solderPasteMargin, -0.0254)
    assert.equal(pad.clearance, 0.1524)
    assert.equal(pad.zoneConnect, 1)
    assert.equal(pad.thermalBridgeWidth, 0.3556)
    assert.equal(pad.thermalGap, 0.2286)
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
