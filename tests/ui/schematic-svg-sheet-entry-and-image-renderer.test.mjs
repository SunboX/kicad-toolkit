// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { SchematicSvgRenderer } from '../../src/renderers.mjs'

test('SchematicSvgRenderer renders hierarchical sheet entries', () => {
    const markup = SchematicSvgRenderer.render(sheetEntryDocument())

    assert.match(
        markup,
        /class="schematic-sheet-entry schematic-sheet-entry--left schematic-sheet-entry--input"/
    )
    assert.match(
        markup,
        /class="schematic-sheet-entry schematic-sheet-entry--right schematic-sheet-entry--output"/
    )
    assert.match(markup, /class="schematic-sheet-entry-marker"/)
    assert.match(markup, /aria-label="IN_SIG"/)
    assert.match(markup, /aria-label="OUT_SIG"/)
})

test('SchematicSvgRenderer renders schematic image payloads and placeholders', () => {
    const markup = SchematicSvgRenderer.render(imageDocument())

    assert.match(markup, /<image class="schematic-image"/)
    assert.match(
        markup,
        new RegExp(
            `href="data:image/png;base64,${escapeRegExp(onePixelPng())}"`
        )
    )
    assert.match(markup, /width="4"/)
    assert.match(markup, /height="4"/)
    assert.match(markup, /class="schematic-image-placeholder"/)
})

test('SchematicSvgRenderer reports sheet entries and images in render-operation metadata', () => {
    const markup = SchematicSvgRenderer.render({
        fileName: 'sheet-entry-image-sidecar.kicad_sch',
        summary: { title: 'Sheet Entry Image Sidecar' },
        schematic: {
            sheet: {
                width: 80,
                height: 50,
                borderOn: false,
                titleBlockOn: false
            },
            lines: [],
            pins: [],
            texts: [],
            sheetEntries: sheetEntries(),
            images: [
                {
                    x: 10,
                    y: 10,
                    scale: 4,
                    data: onePixelPng(),
                    uuid: 'image-valid'
                }
            ]
        }
    })

    assert.match(markup, /"primitive":"sheet_entry"/)
    assert.match(markup, /"primitive":"image"/)
    assert.match(markup, /"type":"sheet-entry-marker"/)
    assert.match(markup, /"type":"image"/)
})

/**
 * Builds a fake document with hierarchical sheet entries.
 * @returns {object}
 */
function sheetEntryDocument() {
    return {
        fileName: 'sheet-entries.kicad_sch',
        summary: { title: 'Sheet Entries' },
        schematic: {
            sheet: {
                width: 80,
                height: 50,
                borderOn: false,
                titleBlockOn: false
            },
            lines: [],
            pins: [],
            texts: [],
            sheetSymbols: [
                {
                    x: 20,
                    y: 10,
                    width: 30,
                    height: 20,
                    name: 'Input Stage'
                }
            ],
            sheetEntries: sheetEntries()
        }
    }
}

/**
 * Builds representative sheet entry rows.
 * @returns {object[]}
 */
function sheetEntries() {
    return [
        {
            x: 20,
            y: 16,
            name: 'IN_SIG',
            side: 'left',
            kind: 'input',
            ownerIndex: 'sheet:0',
            id: 'sheet-pin-in'
        },
        {
            x: 50,
            y: 24,
            name: 'OUT_SIG',
            side: 'right',
            kind: 'output',
            ownerIndex: 'sheet:0',
            id: 'sheet-pin-out'
        }
    ]
}

/**
 * Builds a fake document with valid and missing image payloads.
 * @returns {object}
 */
function imageDocument() {
    return {
        fileName: 'schematic-images.kicad_sch',
        summary: { title: 'Schematic Images' },
        schematic: {
            sheet: {
                width: 80,
                height: 50,
                borderOn: false,
                titleBlockOn: false
            },
            lines: [],
            pins: [],
            texts: [],
            images: [
                {
                    x: 10,
                    y: 10,
                    scale: 4,
                    data: onePixelPng(),
                    uuid: 'image-valid'
                },
                {
                    x: 20,
                    y: 10,
                    scale: 1,
                    data: '',
                    uuid: 'image-missing'
                }
            ]
        }
    }
}

/**
 * Returns a 1x1 transparent PNG payload.
 * @returns {string}
 */
function onePixelPng() {
    return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lWZ0ewAAAABJRU5ErkJggg=='
}

/**
 * Escapes text for literal RegExp matching.
 * @param {string} value Text to escape.
 * @returns {string}
 */
function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
