// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    KicadFootprintLibraryParser,
    KicadParser,
    KicadSymbolLibraryParser
} from '../../src/parser.mjs'

/**
 * Encodes a text fixture as a UTF-8 byte buffer.
 * @param {string} source Source text.
 * @returns {Uint8Array}
 */
function bytes(source) {
    return new TextEncoder().encode(source)
}

/**
 * Returns a fake standalone KiCad footprint library file.
 * @returns {string}
 */
function footprintSource() {
    return `
        (footprint "Resistor_SMD:R_0603"
            (version 20240108)
            (generator "kicad-toolkit-test")
            (layer "F.Cu")
            (descr "Fake resistor footprint")
            (tags "fake resistor")
            (property "Reference" "REF**"
                (at 0 -1.5 0)
                (layer "F.SilkS")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (property "Value" "R_0603"
                (at 0 1.5 0)
                (layer "F.Fab")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (fp_line
                (start -1.5 -0.75)
                (end 1.5 -0.75)
                (stroke (width 0.12) (type solid))
                (layer "F.SilkS")
            )
            (pad "1" smd roundrect
                (at -0.9 0 0)
                (size 0.8 0.9)
                (layers "F.Cu" "F.Paste" "F.Mask")
                (roundrect_rratio 0.2)
            )
            (pad "2" smd roundrect
                (at 0.9 0 0)
                (size 0.8 0.9)
                (layers "F.Cu" "F.Paste" "F.Mask")
                (roundrect_rratio 0.2)
            )
            (model "\${KICAD8_3DMODEL_DIR}/Resistors_SMD.3dshapes/R_0603.step"
                (offset (xyz 0 0 0))
                (scale (xyz 1 1 1))
                (rotate (xyz 0 0 0))
            )
        )
    `
}

/**
 * Returns a fake standalone KiCad symbol library file.
 * @returns {string}
 */
function symbolSource() {
    return `
        (kicad_symbol_lib
            (version 20231120)
            (generator "kicad-toolkit-test")
            (symbol "Device:R"
                (property "Reference" "R"
                    (at 0 2.54 0)
                    (effects (font (size 1.27 1.27)))
                )
                (property "Value" "R"
                    (at 0 -2.54 0)
                    (effects (font (size 1.27 1.27)))
                )
                (symbol "Device:R_0_1"
                    (rectangle
                        (start -1.27 1.27)
                        (end 1.27 -1.27)
                        (stroke (width 0.254) (type default))
                        (fill (type none))
                    )
                    (pin passive line
                        (at -5.08 0 0)
                        (length 2.54)
                        (name "~" (effects (font (size 1.27 1.27))))
                        (number "1" (effects (font (size 1.27 1.27))))
                    )
                    (pin passive line
                        (at 5.08 0 180)
                        (length 2.54)
                        (name "~" (effects (font (size 1.27 1.27))))
                        (number "2" (effects (font (size 1.27 1.27))))
                    )
                )
            )
        )
    `
}

/**
 * Returns a fake symbol with arc graphics and one port on each side.
 * @returns {string}
 */
function portGeometrySymbolSource() {
    return `
        (kicad_symbol_lib
            (version 20231120)
            (generator "kicad-toolkit-test")
            (symbol "Fake:Ported"
                (property "Reference" "U"
                    (at 0 4 0)
                    (effects (font (size 1.27 1.27)))
                )
                (property "Value" "Ported"
                    (at 0 -4 0)
                    (effects (font (size 1.27 1.27)))
                )
                (symbol "Fake:Ported_0_1"
                    (rectangle
                        (start -2 2)
                        (end 2 -2)
                        (stroke (width 0.15) (type default))
                        (fill (type none))
                    )
                    (arc
                        (start 1 0)
                        (mid 0 1)
                        (end -1 0)
                        (stroke (width 0.15) (type default))
                        (fill (type none))
                    )
                    (pin passive line
                        (at -5 0 0)
                        (length 3)
                        (name "L" (effects (font (size 1.27 1.27))))
                        (number "1" (effects (font (size 1.27 1.27))))
                    )
                    (pin passive line
                        (at 5 0 180)
                        (length 3)
                        (name "R" (effects (font (size 1.27 1.27))))
                        (number "2" (effects (font (size 1.27 1.27))))
                    )
                    (pin passive line
                        (at 0 5 270)
                        (length 3)
                        (name "T" (effects (font (size 1.27 1.27))))
                        (number "3" (effects (font (size 1.27 1.27))))
                    )
                    (pin passive line
                        (at 0 -5 90)
                        (length 3)
                        (name "B" (effects (font (size 1.27 1.27))))
                        (number "4" (effects (font (size 1.27 1.27))))
                    )
                )
            )
        )
    `
}

/**
 * Verifies standalone .kicad_mod documents parse as footprint libraries.
 */
test('parses standalone KiCad footprint library files', () => {
    const model = KicadFootprintLibraryParser.parse(footprintSource(), {
        fileName: 'R_0603.kicad_mod'
    })

    assert.equal(model.sourceFormat, 'kicad')
    assert.equal(model.kind, 'footprint-library')
    assert.equal(model.fileType, 'kicad_mod')
    assert.equal(model.fileName, 'R_0603.kicad_mod')
    assert.equal(model.summary.title, 'Resistor_SMD:R_0603')
    assert.equal(model.summary.footprintCount, 1)
    assert.equal(model.summary.padCount, 2)
    assert.equal(model.summary.modelCount, 1)
    assert.equal(model.footprint.libraryName, 'Resistor_SMD:R_0603')
    assert.equal(model.footprint.footprintName, 'Resistor_SMD:R_0603')
    assert.equal(model.pads[0].number, '1')
    assert.equal(model.pads[1].number, '2')
    assert.equal(
        model.models[0].path,
        '${KICAD8_3DMODEL_DIR}/Resistors_SMD.3dshapes/R_0603.step'
    )
    assert.equal(model.pcbLibrary.footprints[0].name, 'R_0603')
})

/**
 * Verifies the generic KiCad parser facade routes .kicad_mod documents.
 */
test('routes standalone KiCad footprint files through the parser facade', () => {
    const model = KicadParser.parseArrayBufferToRendererModel(
        'R_0603.kicad_mod',
        bytes(footprintSource())
    )
    const circuitJson = KicadParser.parseArrayBuffer(
        'R_0603.kicad_mod',
        bytes(footprintSource())
    )

    assert.equal(model.kind, 'footprint-library')
    assert.equal(model.summary.padCount, 2)
    assert.deepEqual(
        circuitJson
            .filter((element) => element.type === 'source_component')
            .map((element) => element.name),
        ['R_0603']
    )
})

/**
 * Verifies standalone .kicad_sym documents parse as symbol libraries.
 */
test('parses standalone KiCad symbol library files', () => {
    const model = KicadSymbolLibraryParser.parse(symbolSource(), {
        fileName: 'Device.kicad_sym'
    })

    assert.equal(model.sourceFormat, 'kicad')
    assert.equal(model.kind, 'symbol-library')
    assert.equal(model.fileType, 'kicad_sym')
    assert.equal(model.fileName, 'Device.kicad_sym')
    assert.equal(model.summary.title, 'Device')
    assert.equal(model.summary.symbolCount, 1)
    assert.equal(model.summary.pinCount, 2)
    assert.equal(model.summary.propertyCount, 2)
    assert.equal(model.symbols[0].name, 'Device:R')
    assert.equal(model.symbols[0].itemName, 'R')
    assert.equal(model.symbols[0].properties.Reference, 'R')
    assert.equal(model.symbols[0].properties.Value, 'R')
    assert.deepEqual(
        model.symbols[0].pins.map((pin) => ({
            number: pin.number,
            name: pin.name,
            orientation: pin.orientation,
            electricalType: pin.electricalType
        })),
        [
            {
                number: '1',
                name: '~',
                orientation: 'right',
                electricalType: 'passive'
            },
            {
                number: '2',
                name: '~',
                orientation: 'left',
                electricalType: 'passive'
            }
        ]
    )
    assert.equal(model.symbols[0].graphics.rectangles.length, 1)
    assert.equal(model.schematicLibrary.symbols[0].pinCount, 2)
})

/**
 * Verifies the generic KiCad parser facade routes .kicad_sym documents.
 */
test('routes standalone KiCad symbol files through the parser facade', () => {
    const model = KicadParser.parseArrayBufferToRendererModel(
        'Device.kicad_sym',
        bytes(symbolSource())
    )
    const circuitJson = KicadParser.parseArrayBuffer(
        'Device.kicad_sym',
        bytes(symbolSource())
    )

    assert.equal(model.kind, 'symbol-library')
    assert.equal(model.summary.symbolCount, 1)
    assert.deepEqual(
        circuitJson
            .filter((element) => element.type === 'source_component')
            .map((element) => element.name),
        ['Device:R']
    )
    assert.deepEqual(
        circuitJson
            .filter((element) => element.type === 'source_port')
            .map((element) => element.pin_number),
        [1, 2]
    )
    assert.equal(
        circuitJson.some((element) => element.type === 'schematic_symbol'),
        true
    )
    assert.equal(
        circuitJson.some((element) => element.type === 'schematic_component'),
        true
    )
    assert.equal(
        circuitJson.some((element) => element.type === 'schematic_port'),
        true
    )
    assert.equal(
        circuitJson.some((element) => element.type === 'schematic_rect'),
        true
    )
    assert.equal(
        circuitJson.some((element) => element.type === 'schematic_line'),
        true
    )
    assert.equal(
        circuitJson.some((element) => element.type === 'schematic_text'),
        true
    )
})

/**
 * Verifies standalone symbol previews retain arc and port placement metadata.
 */
test('emits schematic arc and port placement metadata for symbol previews', () => {
    const circuitJson = KicadParser.parseArrayBuffer(
        'Ported.kicad_sym',
        bytes(portGeometrySymbolSource())
    )
    const arc = circuitJson.find((element) => element.type === 'schematic_arc')
    const ports = circuitJson
        .filter((element) => element.type === 'schematic_port')
        .toSorted((a, b) => a.center.x - b.center.x || a.center.y - b.center.y)

    assert.ok(arc)
    assert.deepEqual(arc.start, { x: 1, y: 0 })
    assert.deepEqual(arc.mid, { x: 0, y: 1 })
    assert.deepEqual(arc.end, { x: -1, y: 0 })
    assert.equal(arc.stroke_width, 0.15)
    assert.deepEqual(
        ports.map((port) => ({
            side: port.side_of_component,
            distance: port.distance_from_component_edge
        })),
        [
            { side: 'left', distance: 3 },
            { side: 'bottom', distance: 3 },
            { side: 'top', distance: 3 },
            { side: 'right', distance: 3 }
        ]
    )
})
