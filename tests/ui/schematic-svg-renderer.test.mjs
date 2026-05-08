// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
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
    const pattern = new RegExp(
        `<g class="[^"]*schematic[^"]*"[^>]*aria-label="${label}"[^>]*>[\\s\\S]*?<\\/g>`
    )
    return markup.match(pattern)?.[0] || ''
}

/**
 * Formats a test number like the SVG renderer.
 * @param {number} value Number.
 * @returns {string}
 */
function formatSvgNumber(value) {
    return value.toFixed(3).replace(/\.?0+$/, '')
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
    const pinNumberWidth = KicadStrokeFont.measureLine('2', 1.27)

    assert.match(
        markup,
        /<circle class="schematic-pin-endpoint" cx="20" cy="20" r="0\.42"/
    )
    assert.match(rightFacingPinNumber, /data-x="20\.35"/)
    assert.match(
        leftFacingPinNumber,
        new RegExp(`data-x="${formatSvgNumber(30 - 0.35 - pinNumberWidth)}"`)
    )
})
