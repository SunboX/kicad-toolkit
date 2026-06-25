// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import * as parserApi from '../../src/parser.mjs'

const {
    CircuitJsonKicadModExporter,
    CircuitJsonKicadProjectExporter,
    KicadPcbParser,
    KicadPcbRegionSemanticsBuilder
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

/**
 * Builds fake Circuit JSON rows for a simple connector-like source component.
 * @param {number} pinCount Source pin count.
 * @param {object} [sourceOverrides] Source component overrides.
 * @returns {object[]}
 */
function simplePinHeaderElements(pinCount, sourceOverrides = {}) {
    const sourceComponent = {
        type: 'source_component',
        source_component_id: 'source_j1',
        name: 'J1',
        ftype: 'simple_pin_header',
        ...sourceOverrides
    }
    const ports = Array.from({ length: pinCount }, (_entry, index) => ({
        type: 'source_port',
        source_port_id: 'source_j1_pin_' + (index + 1),
        source_component_id: 'source_j1',
        pin_number: index + 1
    }))

    return [
        sourceComponent,
        ...ports,
        {
            type: 'schematic_component',
            schematic_component_id: 'schematic_j1',
            source_component_id: 'source_j1',
            center: { x: 10, y: 5 }
        }
    ]
}

/**
 * Formats a positive integer as a two-digit token.
 * @param {number} value Numeric value.
 * @returns {string}
 */
function pad2(value) {
    return String(value).padStart(2, '0')
}

/**
 * Escapes text for dynamic regular expressions.
 * @param {string} text Source text.
 * @returns {string}
 */
function escapedPattern(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

test('CircuitJsonKicadProjectExporter emits rectangular PCB keepouts as keepout zones', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'pcb_keepout',
                pcb_keepout_id: 'keepout_antenna',
                name: 'Antenna clearance',
                shape: 'rect',
                center: { x: 1, y: 2 },
                width: 4,
                height: 2,
                layer: 'bottom'
            }
        ],
        { projectName: 'Keepout Area' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Keepout_Area.kicad_pcb')
    )
    const parsed = KicadPcbParser.parse(pcbText)
    const regionSemantics = KicadPcbRegionSemanticsBuilder.build(parsed)
    const [zone] = parsed.zoneSemantics

    assert.match(pcbText, /\(zone\s+\(net 0\)\s+\(net_name ""\)/)
    assert.match(pcbText, /\(layer "B\.Cu"\)/)
    assert.match(pcbText, /\(name "Antenna clearance"\)/)
    assert.match(pcbText, /\(keepout[\s\S]*?\(tracks not_allowed\)/)
    assert.match(pcbText, /\(keepout[\s\S]*?\(vias not_allowed\)/)
    assert.match(pcbText, /\(keepout[\s\S]*?\(pads not_allowed\)/)
    assert.match(pcbText, /\(keepout[\s\S]*?\(copperpour not_allowed\)/)
    assert.match(pcbText, /\(keepout[\s\S]*?\(footprints not_allowed\)/)
    assert.deepEqual(zone.keepoutTargets, {
        tracks: true,
        vias: true,
        pads: true,
        copperpour: true,
        footprints: true
    })
    assert.equal(regionSemantics.summary.keepoutZoneCount, 1)
})

test('CircuitJsonKicadProjectExporter expands schematic trace edges and junctions', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'schematic_trace',
                schematic_trace_id: 'trace_edges',
                edges: [
                    {
                        from: { x: 0.0000003, y: 0 },
                        to: { x: 5, y: 0 }
                    },
                    {
                        from: { x: 5, y: 0 },
                        to: { x: 5, y: 2 }
                    }
                ],
                junctions: [{ x: 5, y: 0 }]
            }
        ],
        { projectName: 'Trace Edges' }
    )
    const schematicText = decodeEntry(
        findEntry(result, 'kicad/Trace_Edges.kicad_sch')
    )

    assert.equal(countMatches(schematicText, /\(wire\s/gu), 2)
    assert.equal(countMatches(schematicText, /\(junction\s/gu), 1)
    assert.match(schematicText, /\(wire\s+\(pts\s+\(xy 0 0\)\s+\(xy 5 0\)\)/)
    assert.match(schematicText, /\(wire\s+\(pts\s+\(xy 5 0\)\s+\(xy 5 -2\)\)/)
    assert.match(schematicText, /\(junction\s+\(at 5 0\)/)
    assert.doesNotMatch(schematicText, /0\.0000003/)
})

test('CircuitJsonKicadProjectExporter snaps schematic trace endpoints to exported pin anchors', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_u1',
                name: 'U1'
            },
            {
                type: 'source_port',
                source_port_id: 'source_u1_pin_1',
                source_component_id: 'source_u1',
                pin_number: 1
            },
            {
                type: 'source_component',
                source_component_id: 'source_u2',
                name: 'U2'
            },
            {
                type: 'source_port',
                source_port_id: 'source_u2_pin_1',
                source_component_id: 'source_u2',
                pin_number: 1
            },
            {
                type: 'schematic_component',
                schematic_component_id: 'schematic_u1',
                source_component_id: 'source_u1',
                center: { x: 0.3, y: 0.2 }
            },
            {
                type: 'schematic_component',
                schematic_component_id: 'schematic_u2',
                source_component_id: 'source_u2',
                center: { x: 25.7, y: 0.2 }
            },
            {
                type: 'source_trace',
                source_trace_id: 'source_trace_sig',
                connected_source_port_ids: [
                    'source_u1_pin_1',
                    'source_u2_pin_1'
                ]
            },
            {
                type: 'schematic_trace',
                schematic_trace_id: 'schematic_trace_sig',
                source_trace_id: 'source_trace_sig',
                edges: [
                    {
                        from: { x: 0.3, y: 0.2 },
                        to: { x: 25.7, y: 0.2 }
                    }
                ]
            }
        ],
        { projectName: 'Pin Anchor Wires' }
    )
    const schematicText = decodeEntry(
        findEntry(result, 'kicad/Pin_Anchor_Wires.kicad_sch')
    )

    assert.match(
        schematicText,
        /\(wire\s+\(pts\s+\(xy -7\.32 -0\.2\)\s+\(xy 18\.08 -0\.2\)\)/
    )
    assert.doesNotMatch(
        schematicText,
        /\(wire\s+\(pts\s+\(xy 0\.3 -0\.2\)\s+\(xy 25\.7 -0\.2\)\)/
    )
})

test('CircuitJsonKicadProjectExporter preserves placed reference designators', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_j1',
                name: 'J1'
            },
            {
                type: 'source_port',
                source_port_id: 'source_j1_pin_1',
                source_component_id: 'source_j1',
                pin_number: 1
            },
            {
                type: 'schematic_component',
                schematic_component_id: 'schematic_j1',
                source_component_id: 'source_j1',
                center: { x: 10, y: 5 }
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_j1',
                source_component_id: 'source_j1',
                center: { x: 15, y: 5 }
            },
            {
                type: 'pcb_smtpad',
                pcb_smtpad_id: 'pad_j1_1',
                pcb_component_id: 'pcb_j1',
                center: { x: 15, y: 5 },
                width: 1,
                height: 1,
                shape: 'rect',
                number: 1
            }
        ],
        { projectName: 'Reference Designators' }
    )
    const schematicText = decodeEntry(
        findEntry(result, 'kicad/Reference_Designators.kicad_sch')
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Reference_Designators.kicad_pcb')
    )

    assert.match(
        schematicText,
        /\(symbol "J1"[\s\S]*?\(property "Reference" "J"/
    )
    assert.match(
        schematicText,
        /\(symbol\s+\(lib_id "Reference_Designators:J1"\)[\s\S]*?\(property "Reference" "J1"/
    )
    assert.match(
        pcbText,
        /\(footprint "Reference_Designators:J1"[\s\S]*?\(property "Reference" "J1"/
    )
})

test('CircuitJsonKicadProjectExporter assigns source trace port connectivity to pad nets', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_j1',
                name: 'J1'
            },
            {
                type: 'source_port',
                source_port_id: 'source_j1_pin_1',
                source_component_id: 'source_j1',
                pin_number: 1
            },
            {
                type: 'source_component',
                source_component_id: 'source_j2',
                name: 'J2'
            },
            {
                type: 'source_port',
                source_port_id: 'source_j2_pin_1',
                source_component_id: 'source_j2',
                pin_number: 1
            },
            {
                type: 'source_trace',
                source_trace_id: 'source_trace_sig',
                connected_source_port_ids: [
                    'source_j1_pin_1',
                    'source_j2_pin_1'
                ]
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_j1',
                source_component_id: 'source_j1',
                center: { x: 0, y: 0 }
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_j2',
                source_component_id: 'source_j2',
                center: { x: 10, y: 0 }
            },
            {
                type: 'pcb_port',
                pcb_port_id: 'pcb_j1_port_1',
                source_port_id: 'source_j1_pin_1'
            },
            {
                type: 'pcb_port',
                pcb_port_id: 'pcb_j2_port_1',
                source_port_id: 'source_j2_pin_1'
            },
            {
                type: 'pcb_smtpad',
                pcb_smtpad_id: 'pad_j1_1',
                pcb_component_id: 'pcb_j1',
                pcb_port_id: 'pcb_j1_port_1',
                center: { x: 0, y: 0 },
                width: 1,
                height: 1,
                shape: 'rect'
            },
            {
                type: 'pcb_smtpad',
                pcb_smtpad_id: 'pad_j2_1',
                pcb_component_id: 'pcb_j2',
                pcb_port_id: 'pcb_j2_port_1',
                center: { x: 10, y: 0 },
                width: 1,
                height: 1,
                shape: 'rect'
            }
        ],
        { projectName: 'Source Trace Nets' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Source_Trace_Nets.kicad_pcb')
    )
    const netMatch = pcbText.match(/\(net (\d+) "?source_trace_sig"?\)/)

    assert.ok(netMatch)
    assert.equal(
        countMatches(
            pcbText,
            new RegExp(
                '\\(pad "1" smd rect[\\s\\S]*?\\(net ' +
                    netMatch[1] +
                    ' "?source_trace_sig"?\\)',
                'gu'
            )
        ),
        2
    )
})

test('CircuitJsonKicadProjectExporter maps opted-in pin headers to generic connector lib ids', () => {
    for (const pinCount of [1, 2, 10]) {
        const result = CircuitJsonKicadProjectExporter.export(
            simplePinHeaderElements(pinCount),
            {
                projectName: 'Generic Connector ' + pinCount,
                useGenericConnectorSymbols: true
            }
        )
        const schematicText = decodeEntry(
            findEntry(
                result,
                'kicad/Generic_Connector_' + pinCount + '.kicad_sch'
            )
        )
        const libId = 'Connector_Generic:Conn_01x' + pad2(pinCount)
        const libIdPattern = escapedPattern(libId)

        assert.match(
            schematicText,
            new RegExp('\\(symbol "' + libIdPattern + '"')
        )
        assert.match(
            schematicText,
            new RegExp('\\(symbol\\s+\\(lib_id "' + libIdPattern + '"\\)')
        )
        assert.match(schematicText, /\(property "Reference" "J1"/)
    }
})

test('CircuitJsonKicadProjectExporter keeps local and explicit connector symbol ids ahead of generic mapping', () => {
    const localResult = CircuitJsonKicadProjectExporter.export(
        simplePinHeaderElements(2),
        { projectName: 'Local Connector' }
    )
    const localSchematicText = decodeEntry(
        findEntry(localResult, 'kicad/Local_Connector.kicad_sch')
    )
    const explicitResult = CircuitJsonKicadProjectExporter.export(
        simplePinHeaderElements(2, {
            metadata: {
                kicad_symbol: {
                    libId: 'Custom_Lib:Custom_Header'
                }
            }
        }),
        {
            projectName: 'Explicit Connector',
            useGenericConnectorSymbols: true
        }
    )
    const explicitSchematicText = decodeEntry(
        findEntry(explicitResult, 'kicad/Explicit_Connector.kicad_sch')
    )

    assert.match(localSchematicText, /\(lib_id "Local_Connector:J1"\)/)
    assert.doesNotMatch(localSchematicText, /Connector_Generic:Conn_01x02/)
    assert.match(
        explicitSchematicText,
        /\(symbol\s+\(lib_id "Custom_Lib:Custom_Header"\)/
    )
    assert.doesNotMatch(explicitSchematicText, /Connector_Generic:Conn_01x02/)
})

test('CircuitJsonKicadProjectExporter resolves custom symbol ids from component graphics', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_linked',
                name: 'U1',
                ftype: 'simple_chip'
            },
            {
                type: 'source_port',
                source_port_id: 'source_linked_pin_1',
                source_component_id: 'source_linked',
                name: 'A',
                pin_number: 1
            },
            {
                type: 'source_port',
                source_port_id: 'source_linked_pin_2',
                source_component_id: 'source_linked',
                name: 'B',
                pin_number: 2
            },
            {
                type: 'schematic_component',
                schematic_component_id: 'schematic_linked',
                source_component_id: 'source_linked',
                center: { x: 10, y: 10 }
            },
            {
                type: 'schematic_symbol',
                schematic_symbol_id: 'symbol_linked',
                name: 'LinkedBody',
                center: { x: 10, y: 10 },
                width: 6,
                height: 4
            },
            {
                type: 'schematic_port',
                schematic_port_id: 'schematic_linked_pin_1',
                schematic_component_id: 'schematic_linked',
                schematic_symbol_id: 'symbol_linked',
                source_port_id: 'source_linked_pin_1',
                display_pin_label: 'A',
                pin_number: 1,
                center: { x: 7, y: 10 },
                facing_direction: 'left'
            },
            {
                type: 'schematic_port',
                schematic_port_id: 'schematic_linked_pin_2',
                schematic_component_id: 'schematic_linked',
                schematic_symbol_id: 'symbol_linked',
                source_port_id: 'source_linked_pin_2',
                display_pin_label: 'B',
                pin_number: 2,
                center: { x: 13, y: 10 },
                facing_direction: 'right'
            },
            {
                type: 'schematic_line',
                schematic_line_id: 'linked_body_line',
                schematic_component_id: 'schematic_linked',
                schematic_symbol_id: 'symbol_linked',
                x1: 8,
                y1: 9,
                x2: 12,
                y2: 11,
                stroke_width: 0.1
            }
        ],
        { projectName: 'Linked Custom Symbol' }
    )
    const symbolText = decodeEntry(
        findEntry(result, 'kicad/Linked_Custom_Symbol.kicad_sym')
    )
    const schematicText = decodeEntry(
        findEntry(result, 'kicad/Linked_Custom_Symbol.kicad_sch')
    )

    assert.match(symbolText, /\(symbol "LinkedBody"/)
    assert.match(symbolText, /\(name "A"/)
    assert.match(symbolText, /\(name "B"/)
    assert.match(schematicText, /\(lib_id "Linked_Custom_Symbol:LinkedBody"\)/)
})

test('CircuitJsonKicadProjectExporter appends component artwork to generated symbol bodies', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_art',
                name: 'U2',
                ftype: 'simple_chip'
            },
            {
                type: 'source_port',
                source_port_id: 'source_art_pin_1',
                source_component_id: 'source_art',
                name: 'IN',
                pin_number: 1
            },
            {
                type: 'source_port',
                source_port_id: 'source_art_pin_2',
                source_component_id: 'source_art',
                name: 'OUT',
                pin_number: 2
            },
            {
                type: 'schematic_component',
                schematic_component_id: 'schematic_art',
                source_component_id: 'source_art',
                center: { x: 0, y: 0 }
            },
            {
                type: 'schematic_line',
                schematic_line_id: 'schematic_art_inner',
                schematic_component_id: 'schematic_art',
                x1: -1,
                y1: -1,
                x2: 1,
                y2: 1,
                stroke_width: 0.1
            }
        ],
        { projectName: 'Inner Artwork' }
    )
    const symbolText = decodeEntry(
        findEntry(result, 'kicad/Inner_Artwork.kicad_sym')
    )

    assert.match(symbolText, /\(rectangle\s+\(start -5\.08 -2\.54\)/)
    assert.equal(countMatches(symbolText, /\(pin passive line/gu), 2)
    assert.match(symbolText, /\(polyline\s+\(pts\s+\(xy -1 1\)\s+\(xy 1 -1\)\)/)
})

test('CircuitJsonKicadProjectExporter applies schematic symbol metadata flags', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_meta',
                name: 'U3',
                ftype: 'simple_chip',
                metadata: {
                    kicad_symbol: {
                        inBom: false,
                        onBoard: false,
                        excludeFromSim: true,
                        dnp: true,
                        pinNames: {
                            offset: 2.54,
                            hide: true
                        },
                        pinNumbers: {
                            hide: true
                        },
                        embeddedFonts: true
                    }
                }
            },
            {
                type: 'source_port',
                source_port_id: 'source_meta_pin_1',
                source_component_id: 'source_meta',
                name: 'IN',
                pin_number: 1
            },
            {
                type: 'schematic_component',
                schematic_component_id: 'schematic_meta',
                source_component_id: 'source_meta',
                center: { x: 0, y: 0 }
            }
        ],
        { projectName: 'Symbol Metadata Flags' }
    )
    const symbolText = decodeEntry(
        findEntry(result, 'kicad/Symbol_Metadata_Flags.kicad_sym')
    )
    const schematicText = decodeEntry(
        findEntry(result, 'kicad/Symbol_Metadata_Flags.kicad_sch')
    )

    assert.match(schematicText, /\(exclude_from_sim yes\)/)
    assert.match(schematicText, /\(in_bom no\)/)
    assert.match(schematicText, /\(on_board no\)/)
    assert.match(schematicText, /\(dnp yes\)/)
    assert.match(symbolText, /\(pin_names\s+\(offset 2\.54\)\s+hide\)/)
    assert.match(symbolText, /\(pin_numbers\s+hide\)/)
    assert.match(symbolText, /\(embedded_fonts yes\)/)
})

test('CircuitJsonKicadProjectExporter keeps through-obstacle route points finite', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'pcb_trace',
                pcb_trace_id: 'trace_obstacle',
                net: 'SIG',
                route: [
                    { route_type: 'wire', x: 0, y: 0, layer: 'top' },
                    {
                        route_type: 'through_obstacle',
                        start: { x: 1, y: 0 },
                        end: { x: 1, y: 1 },
                        layer: 'top',
                        width: 0.18
                    },
                    { route_type: 'wire', x: 2, y: 1, layer: 'top' },
                    {
                        route_type: 'through_obstacle',
                        start: { x: 'bad', y: 2 },
                        end: { x: 3, y: 'bad' },
                        layer: 'top'
                    },
                    { route_type: 'wire', x: 4, y: 1, layer: 'top' }
                ]
            }
        ],
        { projectName: 'Obstacle Route' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Obstacle_Route.kicad_pcb')
    )

    assert.equal(countMatches(pcbText, /\(segment\s/gu), 2)
    assert.match(
        pcbText,
        /\(segment\s+\(start 0 0\)\s+\(end 1 -1\)[\s\S]*?\(width 0\.18\)/
    )
    assert.match(
        pcbText,
        /\(segment\s+\(start 1 0\)\s+\(end 2 -1\)[\s\S]*?\(width 0\.18\)/
    )
    assert.doesNotMatch(pcbText, /NaN/)
})

test('CircuitJsonKicadProjectExporter resolves pad nets through PCB ports and source-port connectivity', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_u1',
                name: 'U1'
            },
            {
                type: 'source_net',
                source_net_id: 'source_net_sig',
                name: 'SIG',
                subcircuit_connectivity_map_key: 'net_key_sig'
            },
            {
                type: 'source_port',
                source_port_id: 'source_u1_pin_1',
                source_component_id: 'source_u1',
                pin_number: 1,
                subcircuit_connectivity_map_key: 'net_key_sig'
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_u1',
                source_component_id: 'source_u1',
                center: { x: 0, y: 0 },
                layer: 'top'
            },
            {
                type: 'pcb_port',
                pcb_port_id: 'pcb_u1_port_1',
                pcb_component_id: 'pcb_u1',
                source_port_id: 'source_u1_pin_1'
            },
            {
                type: 'pcb_smtpad',
                pcb_smtpad_id: 'pcb_u1_pad_1',
                pcb_component_id: 'pcb_u1',
                pcb_port_id: 'pcb_u1_port_1',
                shape: 'rect',
                x: 0,
                y: 0,
                width: 1,
                height: 1
            }
        ],
        { projectName: 'Port Net Pads' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Port_Net_Pads.kicad_pcb')
    )
    const netMatch = pcbText.match(/\(net (\d+) "SIG"\)/)

    assert.ok(netMatch)
    assert.match(
        pcbText,
        new RegExp(
            '\\(pad "1" smd rect[\\s\\S]*?\\(net ' + netMatch[1] + ' "SIG"\\)'
        )
    )
    assert.doesNotMatch(pcbText, /\(pad "1" smd rect[\s\S]*?\(net 0\)/)
})

test('CircuitJsonKicadProjectExporter emits board-owned PCB artwork paths and shapes', () => {
    const result = CircuitJsonKicadProjectExporter.export(
        [
            {
                type: 'pcb_silkscreen_path',
                pcb_silkscreen_path_id: 'board_silk_path',
                layer: 'top_silkscreen',
                route: [
                    { x: -2, y: 1 },
                    { x: 0, y: 1 },
                    { x: 0, y: 2 }
                ],
                stroke_width: 0.12
            },
            {
                type: 'pcb_note_path',
                pcb_note_path_id: 'board_note_path',
                layer: 'dwgs_user',
                points: [
                    { x: 1, y: 1 },
                    { x: 2, y: 1 }
                ],
                stroke_width: 0.08
            },
            {
                type: 'pcb_silkscreen_circle',
                pcb_silkscreen_circle_id: 'board_silk_circle',
                layer: 'bottom_silkscreen',
                center: { x: 3, y: 1 },
                radius: 0.5,
                stroke_width: 0.05
            },
            {
                type: 'pcb_note_rect',
                pcb_note_rect_id: 'board_note_rect',
                layer: 'dwgs_user',
                center: { x: 4, y: 1 },
                width: 2,
                height: 1,
                stroke_width: 0.07
            }
        ],
        { projectName: 'Board Artwork' }
    )
    const pcbText = decodeEntry(
        findEntry(result, 'kicad/Board_Artwork.kicad_pcb')
    )
    const parsed = KicadPcbParser.parse(pcbText)

    assert.equal(countMatches(pcbText, /\(gr_line\s/gu), 3)
    assert.match(
        pcbText,
        /\(gr_line\s+\(start -2 -1\)\s+\(end 0 -1\)[\s\S]*?\(layer "F\.SilkS"\)/
    )
    assert.match(
        pcbText,
        /\(gr_line\s+\(start 1 -1\)\s+\(end 2 -1\)[\s\S]*?\(layer "Dwgs\.User"\)/
    )
    assert.match(
        pcbText,
        /\(gr_circle\s+\(center 3 -1\)\s+\(end 3\.5 -1\)[\s\S]*?\(layer "B\.SilkS"\)/
    )
    assert.match(
        pcbText,
        /\(gr_rect\s+\(start 3 -0\.5\)\s+\(end 5 -1\.5\)[\s\S]*?\(layer "Dwgs\.User"\)/
    )
    assert.equal(
        parsed.drawings.filter((drawing) => drawing.ownerId === 'board').length,
        5
    )
})

test('CircuitJsonKicadModExporter emits one standalone footprint from Circuit JSON', () => {
    const result = CircuitJsonKicadModExporter.export(
        [
            {
                type: 'source_component',
                source_component_id: 'source_r1',
                name: 'R1',
                manufacturer_part_number: '10k',
                kicad_footprint: {
                    name: 'Passives_R_0603'
                }
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_r1',
                source_component_id: 'source_r1',
                center: { x: 10, y: 5 },
                layer: 'top'
            },
            {
                type: 'pcb_smtpad',
                pcb_smtpad_id: 'pad_r1_1',
                pcb_component_id: 'pcb_r1',
                x: 9.5,
                y: 5,
                width: 0.9,
                height: 1,
                shape: 'rect',
                number: 1
            },
            {
                type: 'pcb_silkscreen_rect',
                pcb_silkscreen_rect_id: 'silk_r1_body',
                pcb_component_id: 'pcb_r1',
                center: { x: 10, y: 5 },
                width: 2,
                height: 1,
                layer: 'top_silkscreen'
            }
        ],
        { basePath: 'parts' }
    )
    const footprintText = decodeEntry(result.entry)

    assert.equal(result.entry.path, 'parts/Passives_R_0603.kicad_mod')
    assert.equal(result.entry.contentType, 'application/x-kicad-footprint')
    assert.equal(result.manifest.footprintName, 'Passives_R_0603')
    assert.match(footprintText, /^\(footprint "Passives_R_0603"/)
    assert.match(footprintText, /\(property "Reference" "R"/)
    assert.match(footprintText, /\(property "Value" "10k"/)
    assert.match(footprintText, /\(pad "1" smd rect \(at -0\.5 0 0\)/)
    assert.match(footprintText, /\(fp_rect\s+\(start -1 -0\.5\)/)
})
