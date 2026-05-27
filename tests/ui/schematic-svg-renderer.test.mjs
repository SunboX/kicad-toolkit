// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadParser } from '../../src/parser.mjs'
import { KicadStrokeFont, SchematicSvgRenderer } from '../../src/renderers.mjs'

/**
 * Creates a schematic document model with representative KiCad text cases.
 * @returns {object}
 */
function createSchematicDocument() {
    return {
        fileName: 'fake-audio-input.kicad_sch',
        summary: { title: 'Audio Input' },
        schematic: {
            sheet: {
                width: 80,
                height: 50,
                borderOn: false,
                titleBlockOn: false
            },
            lines: [],
            rectangles: [],
            pins: [
                {
                    x: 20,
                    y: 20,
                    length: 2.54,
                    orientation: 'right',
                    designator: '1',
                    numberFontSize: 1.27,
                    numberVisible: true,
                    endpointVisible: true
                },
                {
                    x: 30,
                    y: 20,
                    length: 2.54,
                    orientation: 'left',
                    designator: '2',
                    numberFontSize: 1.27,
                    numberVisible: true,
                    endpointVisible: true
                }
            ],
            texts: [
                {
                    x: 40,
                    y: 18,
                    text: 'R2',
                    ownerIndex: 'symbol:r2',
                    propertyName: 'Reference',
                    fontSize: 1.27,
                    font: {
                        width: 1.27,
                        height: 1.27,
                        hAlign: 'center',
                        vAlign: 'center'
                    },
                    rotation: 90,
                    anchor: 'middle',
                    vAlign: 'center'
                },
                {
                    x: 12,
                    y: 8,
                    text: 'VCC',
                    ownerIndex: 'power:vcc',
                    symbolKind: 'power',
                    fontSize: 1.27,
                    font: {
                        width: 1.27,
                        height: 1.27,
                        hAlign: 'left',
                        vAlign: 'bottom'
                    }
                },
                {
                    x: 12,
                    y: 32,
                    text: 'GND',
                    ownerIndex: 'power:gnd',
                    symbolKind: 'power',
                    fontSize: 1.27,
                    font: {
                        width: 1.27,
                        height: 1.27,
                        hAlign: 'left',
                        vAlign: 'bottom'
                    }
                }
            ],
            junctions: []
        }
    }
}

/**
 * Extracts one rendered stroke text group by label.
 * @param {string} markup Rendered SVG markup.
 * @param {string} label Aria label.
 * @returns {string}
 */
function renderedTextGroup(markup, label) {
    const safeLabel = escapeRegExp(label)
    const pattern = new RegExp(
        `<g class="[^"]*schematic[^"]*"[^>]*aria-label="${safeLabel}"[^>]*>[\\s\\S]*?<\\/g>`
    )
    return markup.match(pattern)?.[0] || ''
}

/**
 * Extracts one rendered stroke text group by class and label.
 * @param {string} markup Rendered SVG markup.
 * @param {string} className Expected class name.
 * @param {string} label Aria label.
 * @returns {string}
 */
function renderedTextGroupByClass(markup, className, label) {
    const safeLabel = escapeRegExp(label)
    const pattern = new RegExp(
        `<g class="[^"]*${className}[^"]*"[^>]*aria-label="${safeLabel}"[^>]*>[\\s\\S]*?<\\/g>`
    )
    return markup.match(pattern)?.[0] || ''
}

/**
 * Escapes text for literal RegExp matching.
 * @param {string} value Text to escape.
 * @returns {string}
 */
function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Formats a test number like the SVG renderer.
 * @param {number} value Number.
 * @returns {string}
 */
function formatSvgNumber(value) {
    return value.toFixed(3).replace(/\.?0+$/, '')
}

/**
 * Calculates the expected baseline for center-aligned test text.
 * @param {number} y Anchor y.
 * @param {number} size Text size.
 * @returns {number}
 */
function centeredTextBaseline(y, size) {
    return y + size - 0.12 * 0.052 - (size * 1.17) / 2
}

/**
 * Calculates the expected baseline for bottom-aligned test text.
 * @param {number} y Anchor y.
 * @param {number} size Text size.
 * @returns {number}
 */
function bottomTextBaseline(y, size) {
    return y + size - 0.12 * 0.052 - size * 1.17
}

/**
 * Mirrors KiCad's PIN_TEXT_MARGIN plus default pen width for pin numbers.
 * @returns {number}
 */
function pinTextMargin() {
    return 0.1016 + 0.12
}

/**
 * Mirrors KiCad stroke-font x offset from FONT::getLinePositions().
 * @returns {number}
 */
function strokeTextXOffset() {
    return 0.12 / 1.52
}

/**
 * Mirrors KiCad's local-label schematic text offset.
 * @param {number} size Text height.
 * @returns {number}
 */
function localLabelTextOffset(size) {
    return size * 0.15 + 0.12
}

/**
 * Mirrors KiCad's stroke text box height for one field line.
 * @param {number} size Text size.
 * @returns {number}
 */
function fieldTextBoxHeight(size) {
    return size * 1.17
}

/**
 * Calculates a KiCad symbol field draw center after parent transform.
 * @param {object} options Field and parent geometry.
 * @returns {{ x: number, y: number }}
 */
function transformedSymbolFieldCenter(options) {
    const width = KicadStrokeFont.measureLine(options.text, options.size)
    const height = fieldTextBoxHeight(options.size)
    const position = inverseTransformAroundSymbol(
        { x: options.x, y: options.y },
        options
    )
    let left = position.x
    const top = position.y - height / 2

    if (options.hAlign === 'center') left -= width / 2
    if (options.hAlign === 'right') left -= width

    const begin = rotateAround(
        { x: left, y: top },
        position,
        options.fieldRotation
    )
    const end = rotateAround(
        { x: left + width, y: top + height },
        position,
        options.fieldRotation
    )
    const transformedBegin = transformAroundSymbol(begin, options)
    const transformedEnd = transformAroundSymbol(end, options)
    return {
        x: (transformedBegin.x + transformedEnd.x) / 2,
        y: (transformedBegin.y + transformedEnd.y) / 2
    }
}

/**
 * Applies KiCad's inverse symbol placement transform to a field position.
 * @param {{ x: number, y: number }} point Display point from the schematic file.
 * @param {object} options Transform options.
 * @returns {{ x: number, y: number }}
 */
function inverseTransformAroundSymbol(point, options) {
    return rotateAround(
        point,
        { x: options.symbolX, y: options.symbolY },
        (360 - options.symbolRotation) % 360
    )
}

/**
 * Rotates one screen-coordinate point around an origin using a KiCad angle.
 * @param {{ x: number, y: number }} point Point.
 * @param {{ x: number, y: number }} origin Rotation origin.
 * @param {number} rotation KiCad text rotation.
 * @returns {{ x: number, y: number }}
 */
function rotateAround(point, origin, rotation) {
    const radians = -rotation * (Math.PI / 180)
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    const dx = point.x - origin.x
    const dy = point.y - origin.y
    return {
        x: origin.x + dx * cos - dy * sin,
        y: origin.y + dx * sin + dy * cos
    }
}

/**
 * Applies a KiCad symbol placement transform around the symbol origin.
 * @param {{ x: number, y: number }} point Point.
 * @param {object} options Transform options.
 * @returns {{ x: number, y: number }}
 */
function transformAroundSymbol(point, options) {
    return rotateAround(
        point,
        { x: options.symbolX, y: options.symbolY },
        options.symbolRotation
    )
}

/**
 * Encodes fixture source to an ArrayBuffer-like byte view.
 * @param {string} source Source fixture.
 * @returns {Uint8Array}
 */
function bytesFor(source) {
    return new TextEncoder().encode(source)
}

/**
 * Builds a fake two-pin part with scalar hidden pin-number metadata.
 * @returns {string}
 */
function scalarHiddenPinNumberSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Test:PLATE_PAIR"
                (pin_numbers hide)
                (symbol "PLATE_PAIR_0_1"
                    (polyline
                        (pts (xy -2 0.75) (xy 2 0.75))
                        (stroke (width 0.5) (type default))
                        (fill (type none))
                    )
                    (polyline
                        (pts (xy -2 -0.75) (xy 2 -0.75))
                        (stroke (width 0.5) (type default))
                        (fill (type none))
                    )
                )
                (symbol "PLATE_PAIR_1_1"
                    (pin passive line (at 0 3.75 270) (length 2.75)
                        (name "" (effects (font (size 1.27 1.27))))
                        (number "1" (effects (font (size 1.27 1.27))))
                    )
                    (pin passive line (at 0 -3.75 90) (length 2.75)
                        (name "" (effects (font (size 1.27 1.27))))
                        (number "2" (effects (font (size 1.27 1.27))))
                    )
                )
            )
        )
        (symbol "Test:PLATE_PAIR" (at 20 20 0) (unit 1)
            (property "Reference" "C1" (at 22 18 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "100n" (at 22 22 0)
                (effects (font (size 1.27 1.27)))
            )
            (uuid "fake-plate-pair")
        )
    )`
}

/**
 * Builds a fake IC-like part with top and side pins.
 * @returns {string}
 */
function namedPinSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Test:EDGE_PART"
                (pin_names (offset 1.016))
                (symbol "EDGE_PART_1_1"
                    (rectangle
                        (start -5 5)
                        (end 5 -5)
                        (stroke (width 0.15) (type default))
                        (fill (type background))
                    )
                    (pin power_in line (at -2 7.54 270) (length 2.54)
                        (name "DVDD" (effects (font (size 1.27 1.27))))
                        (number "23" (effects (font (size 1.27 1.27))))
                    )
                    (pin bidirectional line (at 7.54 1 180) (length 2.54)
                        (name "USB_DP" (effects (font (size 1.27 1.27))))
                        (number "47" (effects (font (size 1.27 1.27))))
                    )
                )
            )
        )
        (symbol "Test:EDGE_PART" (at 20 20 0) (unit 1)
            (property "Reference" "U1" (at 14 14 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "EDGE_PART" (at 14 26 0)
                (effects (font (size 1.27 1.27)))
            )
            (uuid "fake-edge-part")
        )
    )`
}

/**
 * Builds a fake schematic with KiCad overbar text markup on labels and pins.
 * @returns {string}
 */
function overbarMarkupSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Test:OVERBAR_PART"
                (pin_names (offset 1.016))
                (symbol "OVERBAR_PART_1_1"
                    (rectangle
                        (start -5 5)
                        (end 5 -5)
                        (stroke (width 0.15) (type default))
                        (fill (type background))
                    )
                    (pin input line (at 7.54 0 180) (length 2.54)
                        (name "~{CS}" (effects (font (size 1.27 1.27))))
                        (number "1" (effects (font (size 1.27 1.27))))
                    )
                )
            )
        )
        (label "~{USB_BOOT}" (at 12 18 0)
            (effects (font (size 1.27 1.27)))
        )
        (symbol "Test:OVERBAR_PART" (at 20 20 0) (unit 1)
            (property "Reference" "U1" (at 14 14 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "OVERBAR_PART" (at 14 26 0)
                (effects (font (size 1.27 1.27)))
            )
            (uuid "fake-overbar-part")
        )
    )`
}

/**
 * Builds a fake schematic with a right-facing local label.
 * @returns {string}
 */
function localLabelPlacementSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (label "XIN" (at 20 10 180)
            (effects (font (size 1.27 1.27)) (justify right bottom))
        )
    )`
}

/**
 * Builds a minimal rotated capacitor fixture with KiCad-style symbol fields.
 * @returns {string}
 */
function rotatedCapacitorFieldSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Device:C"
                (pin_numbers hide)
                (symbol "C_0_1"
                    (polyline
                        (pts (xy -2.032 -0.762) (xy 2.032 -0.762))
                        (stroke (width 0.508) (type default))
                        (fill (type none))
                    )
                    (polyline
                        (pts (xy -2.032 0.762) (xy 2.032 0.762))
                        (stroke (width 0.508) (type default))
                        (fill (type none))
                    )
                )
                (symbol "C_1_1"
                    (pin passive line (at 0 3.81 270) (length 2.794)
                        (name "~" (effects (font (size 1.27 1.27))))
                        (number "1" (effects (font (size 1.27 1.27))))
                    )
                    (pin passive line (at 0 -3.81 90) (length 2.794)
                        (name "~" (effects (font (size 1.27 1.27))))
                        (number "2" (effects (font (size 1.27 1.27))))
                    )
                )
            )
        )
        (symbol (lib_id "Device:C") (at 50.8 218.44 270) (unit 1)
            (property "Reference" "C15" (at 51.9684 221.361 0)
                (effects (font (size 1.27 1.27)) (justify left))
            )
            (property "Value" "27p" (at 49.657 221.361 0)
                (effects (font (size 1.27 1.27)) (justify left))
            )
            (uuid "rotated-capacitor-field")
        )
    )`
}

/**
 * Builds a minimal rotated resistor fixture with KiCad default field justification.
 * @returns {string}
 */
function rotatedResistorFieldSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Device:R"
                (symbol "R_0_1"
                    (rectangle
                        (start -2.54 1.016)
                        (end 2.54 -1.016)
                        (stroke (width 0.254) (type default))
                        (fill (type none))
                    )
                )
                (symbol "R_1_1"
                    (pin passive line (at -3.81 0 0) (length 1.27)
                        (name "~" (effects (font (size 1.27 1.27))))
                        (number "1" (effects (font (size 1.27 1.27))))
                    )
                    (pin passive line (at 3.81 0 180) (length 1.27)
                        (name "~" (effects (font (size 1.27 1.27))))
                        (number "2" (effects (font (size 1.27 1.27))))
                    )
                )
            )
        )
        (symbol (lib_id "Device:R") (at 83.82 228.6 270) (unit 1)
            (property "Reference" "R5" (at 83.82 223.3422 90)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "1k" (at 83.82 225.6536 90)
                (effects (font (size 1.27 1.27)))
            )
            (uuid "rotated-resistor-field")
        )
    )`
}

/**
 * Builds a fake symbol with body-background and outline-filled graphics.
 * @returns {string}
 */
function layeredSymbolGraphicSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Test:GLYPH_PART"
                (symbol "GLYPH_PART_0_1"
                    (rectangle (start -4 -4) (end 4 4)
                        (stroke (width 0.2) (type solid))
                        (fill (type background))
                    )
                    (polyline
                        (pts
                            (xy -2 1)
                            (xy 2 1)
                            (xy 0 -1)
                            (xy -2 1)
                        )
                        (stroke (width 0.2) (type solid))
                        (fill (type outline))
                    )
                )
            )
        )
        (symbol "Test:GLYPH_PART" (at 20 20 0) (unit 1)
            (property "Reference" "U1" (at 14 14 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "GLYPH_PART" (at 14 26 0)
                (effects (font (size 1.27 1.27)))
            )
            (uuid "fake-glyph-part")
        )
    )`
}

test('SchematicSvgRenderer renders schematic text with KiCad stroke font geometry', () => {
    const markup = SchematicSvgRenderer.render(createSchematicDocument())
    const reference = renderedTextGroup(markup, 'R2')
    const referenceWidth = KicadStrokeFont.measureLine('R2', 1.27)

    assert.match(reference, /class="schematic-text"/)
    assert.match(reference, /class="schematic-text-line"/)
    assert.match(reference, /class="schematic-text-stroke"/)
    assert.match(reference, /transform="rotate\(-90 40 18\)"/)
    assert.match(
        reference,
        new RegExp(`data-x="${formatSvgNumber(40 - referenceWidth / 2)}"`)
    )
    assert.doesNotMatch(markup, /<text class="schematic-text/)
})

test('SchematicSvgRenderer centers KiCad power symbol labels', () => {
    const markup = SchematicSvgRenderer.render(createSchematicDocument())
    const vccLabel = renderedTextGroup(markup, 'VCC')
    const gndLabel = renderedTextGroup(markup, 'GND')
    const vccWidth = KicadStrokeFont.measureLine('VCC', 1.27)
    const gndWidth = KicadStrokeFont.measureLine('GND', 1.27)

    assert.match(
        vccLabel,
        new RegExp(`data-x="${formatSvgNumber(12 - vccWidth / 2)}"`)
    )
    assert.match(
        gndLabel,
        new RegExp(`data-x="${formatSvgNumber(12 - gndWidth / 2)}"`)
    )
})

test('SchematicSvgRenderer places connector pin numbers beside endpoint markers', () => {
    const markup = SchematicSvgRenderer.render(createSchematicDocument())
    const rightFacingPinNumber = renderedTextGroup(markup, '1')
    const leftFacingPinNumber = renderedTextGroup(markup, '2')
    const rightPinNumberWidth = KicadStrokeFont.measureLine('1', 1.27)
    const pinNumberWidth = KicadStrokeFont.measureLine('2', 1.27)

    assert.match(
        markup,
        /<circle class="schematic-pin-endpoint" cx="20" cy="20" r="0\.42"/
    )
    assert.match(
        rightFacingPinNumber,
        new RegExp(
            `data-x="${formatSvgNumber(20 + 2.54 / 2 - rightPinNumberWidth / 2)}"`
        )
    )
    assert.match(
        rightFacingPinNumber,
        new RegExp(
            `data-y="${formatSvgNumber(bottomTextBaseline(20 - pinTextMargin(), 1.27))}"`
        )
    )
    assert.match(
        leftFacingPinNumber,
        new RegExp(
            `data-x="${formatSvgNumber(30 - 2.54 / 2 - pinNumberWidth / 2)}"`
        )
    )
    assert.match(
        leftFacingPinNumber,
        new RegExp(
            `data-y="${formatSvgNumber(bottomTextBaseline(20 - pinTextMargin(), 1.27))}"`
        )
    )
})

test('SchematicSvgRenderer does not draw KiCad scalar-hidden pin numbers', () => {
    const document = KicadParser.parseArrayBuffer(
        'fake-plate-pair.kicad_sch',
        bytesFor(scalarHiddenPinNumberSource())
    )
    const markup = SchematicSvgRenderer.render(document)

    assert.deepEqual(
        document.schematic.pins.map((pin) => pin.numberVisible),
        [false, false]
    )
    assert.doesNotMatch(markup, /class="schematic-pin-number"/)
})

test('SchematicSvgRenderer renders KiCad pin names and rotated top pin numbers', () => {
    const document = KicadParser.parseArrayBuffer(
        'fake-edge-part.kicad_sch',
        bytesFor(namedPinSource())
    )
    const markup = SchematicSvgRenderer.render(document)
    const topPin = document.schematic.pins.find(
        (pin) => pin.designator === '23'
    )
    const sidePin = document.schematic.pins.find(
        (pin) => pin.designator === '47'
    )
    const topPinNumber = renderedTextGroupByClass(
        markup,
        'schematic-pin-number',
        '23'
    )
    const topPinName = renderedTextGroupByClass(
        markup,
        'schematic-pin-name',
        'DVDD'
    )
    const sidePinName = renderedTextGroupByClass(
        markup,
        'schematic-pin-name',
        'USB_DP'
    )
    const sidePinNameWidth = KicadStrokeFont.measureLine('USB_DP', 1.27)

    assert.equal(topPin.nameVisible, true)
    assert.equal(topPin.nameOffset, 1.016)
    assert.equal(sidePin.nameVisible, true)
    assert.match(
        topPinNumber,
        new RegExp(
            `transform="rotate\\(-90 ${formatSvgNumber(topPin.x - pinTextMargin())} ${formatSvgNumber(topPin.y - topPin.length / 2)}\\)"`
        )
    )
    assert.match(
        topPinNumber,
        new RegExp(
            `data-y="${formatSvgNumber(bottomTextBaseline(topPin.y - topPin.length / 2, 1.27))}"`
        )
    )
    assert.match(topPinName, /transform="rotate\(-90 /)
    assert.match(
        sidePinName,
        new RegExp(
            `data-x="${formatSvgNumber(sidePin.x - 1.016 - sidePinNameWidth - strokeTextXOffset())}"`
        )
    )
    assert.doesNotMatch(sidePinName, /transform="rotate/)
})

test('SchematicSvgRenderer applies KiCad overbar markup to labels and pin names', () => {
    const document = KicadParser.parseArrayBuffer(
        'fake-overbar-part.kicad_sch',
        bytesFor(overbarMarkupSource())
    )
    const markup = SchematicSvgRenderer.render(document)
    const bootLabel = renderedTextGroup(markup, '~{USB_BOOT}')
    const csPin = document.schematic.pins.find((pin) => pin.name === '~{CS}')
    const csName = renderedTextGroupByClass(
        markup,
        'schematic-pin-name',
        '~{CS}'
    )
    const csWidth = KicadStrokeFont.measureLine('CS', 1.27)
    const overbarStrokes = KicadStrokeFont.strokeLine('~{CS}', {
        x: 10,
        y: 20,
        sizeX: 1,
        sizeY: 1
    })
    const plainStrokes = KicadStrokeFont.strokeLine('CS', {
        x: 10,
        y: 20,
        sizeX: 1,
        sizeY: 1
    })

    assert.equal(
        KicadStrokeFont.measureLine('~{USB_BOOT}', 1.27),
        KicadStrokeFont.measureLine('USB_BOOT', 1.27)
    )
    assert.equal(overbarStrokes.length, plainStrokes.length + 1)
    assert.deepEqual(overbarStrokes.at(-1), [
        { x: 10.1, y: 18.77 },
        { x: 10 + KicadStrokeFont.measureLine('CS', 1) - 0.1, y: 18.77 }
    ])
    assert.match(bootLabel, /aria-label="~\{USB_BOOT\}"/)
    assert.match(
        csName,
        new RegExp(
            `data-x="${formatSvgNumber(csPin.x - 1.016 - csWidth - strokeTextXOffset())}"`
        )
    )
})

test('SchematicSvgRenderer offsets right-justified KiCad local labels from wires', () => {
    const document = KicadParser.parseArrayBuffer(
        'fake-local-label.kicad_sch',
        bytesFor(localLabelPlacementSource())
    )
    const markup = SchematicSvgRenderer.render(document)
    const label = renderedTextGroupByClass(markup, 'schematic-label', 'XIN')
    const labelWidth = KicadStrokeFont.measureLine('XIN', 1.27)

    assert.doesNotMatch(label, /transform="rotate/)
    assert.match(
        label,
        new RegExp(
            `data-x="${formatSvgNumber(20 - labelWidth - strokeTextXOffset())}"`
        )
    )
    assert.match(
        label,
        new RegExp(
            `data-y="${formatSvgNumber(bottomTextBaseline(10 - localLabelTextOffset(1.27), 1.27))}"`
        )
    )
})

test('SchematicSvgRenderer centers rotated symbol fields on KiCad text boxes', () => {
    const document = KicadParser.parseArrayBuffer(
        'fake-rotated-cap-field.kicad_sch',
        bytesFor(rotatedCapacitorFieldSource())
    )
    const markup = SchematicSvgRenderer.render(document)
    const reference = renderedTextGroup(markup, 'C15')
    const value = renderedTextGroup(markup, '27p')
    const referenceCenter = transformedSymbolFieldCenter({
        text: 'C15',
        x: 51.9684,
        y: 221.361,
        fieldRotation: 0,
        symbolX: 50.8,
        symbolY: 218.44,
        symbolRotation: 270,
        size: 1.27,
        hAlign: 'left'
    })
    const valueCenter = transformedSymbolFieldCenter({
        text: '27p',
        x: 49.657,
        y: 221.361,
        fieldRotation: 0,
        symbolX: 50.8,
        symbolY: 218.44,
        symbolRotation: 270,
        size: 1.27,
        hAlign: 'left'
    })

    assert.match(
        reference,
        new RegExp(
            `transform="rotate\\(-90 ${formatSvgNumber(referenceCenter.x)} ${formatSvgNumber(referenceCenter.y)}\\)"`
        )
    )
    assert.match(
        reference,
        new RegExp(
            `data-x="${formatSvgNumber(referenceCenter.x - KicadStrokeFont.measureLine('C15', 1.27) / 2)}"`
        )
    )
    assert.match(
        reference,
        new RegExp(
            `data-y="${formatSvgNumber(centeredTextBaseline(referenceCenter.y, 1.27))}"`
        )
    )
    assert.match(
        value,
        new RegExp(
            `transform="rotate\\(-90 ${formatSvgNumber(valueCenter.x)} ${formatSvgNumber(valueCenter.y)}\\)"`
        )
    )
})

test('SchematicSvgRenderer uses KiCad center defaults for rotated symbol fields', () => {
    const document = KicadParser.parseArrayBuffer(
        'fake-rotated-resistor-field.kicad_sch',
        bytesFor(rotatedResistorFieldSource())
    )
    const markup = SchematicSvgRenderer.render(document)
    const reference = renderedTextGroup(markup, 'R5')
    const value = renderedTextGroup(markup, '1k')
    const referenceCenter = transformedSymbolFieldCenter({
        text: 'R5',
        x: 83.82,
        y: 223.3422,
        fieldRotation: 90,
        symbolX: 83.82,
        symbolY: 228.6,
        symbolRotation: 270,
        size: 1.27,
        hAlign: 'center'
    })
    const valueCenter = transformedSymbolFieldCenter({
        text: '1k',
        x: 83.82,
        y: 225.6536,
        fieldRotation: 90,
        symbolX: 83.82,
        symbolY: 228.6,
        symbolRotation: 270,
        size: 1.27,
        hAlign: 'center'
    })

    assert.match(
        reference,
        new RegExp(
            `data-x="${formatSvgNumber(referenceCenter.x - KicadStrokeFont.measureLine('R5', 1.27) / 2)}"`
        )
    )
    assert.match(
        reference,
        new RegExp(
            `data-y="${formatSvgNumber(centeredTextBaseline(referenceCenter.y, 1.27))}"`
        )
    )
    assert.match(
        value,
        new RegExp(
            `data-x="${formatSvgNumber(valueCenter.x - KicadStrokeFont.measureLine('1k', 1.27) / 2)}"`
        )
    )
    assert.match(
        value,
        new RegExp(
            `data-y="${formatSvgNumber(centeredTextBaseline(valueCenter.y, 1.27))}"`
        )
    )
})

test('KicadStrokeFont applies KiCad subscript and superscript markup sizing', () => {
    const expectedWidth =
        KicadStrokeFont.measureLine('V', 1) +
        KicadStrokeFont.measureLine('1', 0.8) +
        KicadStrokeFont.measureLine('2', 0.8)

    assert.equal(KicadStrokeFont.measureLine('V_{1}^{2}', 1), expectedWidth)
})

test('SchematicSvgRenderer draws KiCad outline-filled symbol graphics above body backgrounds', () => {
    const document = KicadParser.parseArrayBuffer(
        'fake-glyph-part.kicad_sch',
        bytesFor(layeredSymbolGraphicSource())
    )
    const markup = SchematicSvgRenderer.render(document)
    const backgroundFillIndex = markup.indexOf(
        '<rect class="schematic-rect schematic-shape-fill"'
    )
    const foregroundFillIndex = markup.indexOf(
        '<path class="schematic-polygon schematic-shape-fill"'
    )

    assert.notEqual(backgroundFillIndex, -1)
    assert.notEqual(foregroundFillIndex, -1)
    assert.ok(backgroundFillIndex < foregroundFillIndex)
    assert.match(
        markup,
        /<rect class="schematic-rect schematic-shape-fill"[^>]*fill="var\(--schematic-fill-color\)"[^>]*stroke="none"/
    )
    assert.match(
        markup,
        /<path class="schematic-polygon schematic-shape-fill"[^>]*fill="var\(--schematic-power-color\)"[^>]*stroke="none"/
    )
    assert.match(
        markup,
        /<rect class="schematic-rect schematic-shape-stroke"[^>]*width="8" height="8"[^>]*stroke-width="0\.2"/
    )
})

test('SchematicSvgRenderer does not draw hidden KiCad pins or their numbers', () => {
    const document = createSchematicDocument()
    document.schematic.pins = [
        {
            x: 12,
            y: 12,
            length: 0,
            orientation: 'top',
            designator: '1',
            numberFontSize: 1.27,
            numberVisible: false,
            endpointVisible: false,
            visible: false
        }
    ]

    const markup = SchematicSvgRenderer.render(document)

    assert.doesNotMatch(markup, /class="schematic-pin-line"/)
    assert.doesNotMatch(markup, /class="schematic-pin-number"/)
})

test('SchematicSvgRenderer renders KiCad-like sheet grid and shape families', () => {
    const document = createSchematicDocument()
    document.schematic.sheet.visibleGrid = 2.54
    document.schematic.polygons = [
        {
            points: [
                { x: 5, y: 5 },
                { x: 15, y: 5 },
                { x: 15, y: 15 }
            ],
            fill: 'background',
            lineWidth: 0.1
        }
    ]
    document.schematic.ellipses = [
        {
            x: 22,
            y: 10,
            radiusX: 3,
            radiusY: 3,
            fill: 'none',
            lineWidth: 0.1
        }
    ]
    document.schematic.arcs = [
        {
            start: { x: 30, y: 10 },
            mid: { x: 35, y: 5 },
            end: { x: 40, y: 10 },
            width: 0.1
        }
    ]
    document.schematic.beziers = [
        {
            points: [
                { x: 45, y: 10 },
                { x: 48, y: 5 },
                { x: 52, y: 15 },
                { x: 55, y: 10 }
            ],
            width: 0.1
        }
    ]

    const markup = SchematicSvgRenderer.render(document)

    assert.match(markup, /<pattern id="schematic-grid-/)
    assert.match(markup, /class="schematic-grid"/)
    assert.match(markup, /<path class="schematic-polygon(?:\s|")/)
    assert.match(markup, /<ellipse class="schematic-ellipse(?:\s|")/)
    assert.match(markup, /<path class="schematic-arc(?:\s|")/)
    assert.match(markup, /<path class="schematic-bezier(?:\s|")/)
})

test('SchematicSvgRenderer draws KiCad worksheet-sized title block chrome', () => {
    const markup = SchematicSvgRenderer.render({
        fileName: 'generic-a3-title.kicad_sch',
        summary: { title: 'Generic A3 Design' },
        schematic: {
            sheet: {
                width: 420,
                height: 297,
                visibleGrid: 2.54,
                marginWidth: 10,
                xZones: 8,
                yZones: 6,
                paperSize: 'A3',
                borderOn: true,
                titleBlockOn: true,
                titleBlock: {
                    title: 'Generic A3 Design',
                    revision: 'A',
                    documentNumber: 'Generic Company',
                    sheetNumber: '1',
                    sheetTotal: '1',
                    date: '2026-05-26',
                    drawnBy: 'Generic User'
                }
            },
            lines: [],
            components: [],
            rectangles: [],
            pins: [],
            texts: []
        }
    })
    const zoneLabels = markup.match(/class="sheet-zone-label"/g) || []

    assert.match(markup, /<rect x="3000" y="2530" width="1080" height="320"\/>/)
    assert.equal(zoneLabels.length, 28)
    assert.doesNotMatch(markup, /<text class="sheet-title-label"/)
    assert.doesNotMatch(markup, /<text class="sheet-zone-label"/)
    assert.match(markup, /class="sheet-title-label"[^>]*aria-label="Sheet: \//)
    assert.match(
        markup,
        /class="sheet-title-value sheet-title-value--title"[^>]*aria-label="Title: Generic A3 Design"/
    )
    assert.match(markup, /class="schematic-text-stroke"/)
})
