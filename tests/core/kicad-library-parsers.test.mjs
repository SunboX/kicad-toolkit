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
        ['1', '2']
    )
})
