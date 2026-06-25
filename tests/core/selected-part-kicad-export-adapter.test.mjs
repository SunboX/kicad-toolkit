import assert from 'node:assert/strict'
import test from 'node:test'

import {
    KicadSelectedPartExporter,
    SelectedPartKicadExportAdapter
} from '../../src/parser.mjs'

/**
 * Decodes one exported text entry.
 * @param {{ bytes: Uint8Array }} entry Export entry.
 * @returns {string}
 */
function decodeEntry(entry) {
    return new TextDecoder().decode(entry.bytes)
}

/**
 * Verifies normalized selected-part data is adapted into native KiCad nodes.
 */
test('SelectedPartKicadExportAdapter builds KiCad symbol and footprint nodes', () => {
    const adapted = SelectedPartKicadExportAdapter.adapt(
        {
            designator: 'X1',
            symbol: {
                name: 'Fake Device',
                value: 'FAKE',
                origin: { x: 100, y: 100 },
                rectangles: [
                    {
                        x: 80,
                        y: 80,
                        width: 40,
                        height: 40,
                        lineWidth: 1
                    }
                ],
                pins: [
                    {
                        name: 'IN',
                        number: '1',
                        x: 80,
                        y: 100,
                        length: 10,
                        orientation: 'left'
                    },
                    {
                        name: 'OUT',
                        number: '2',
                        x: 120,
                        y: 100,
                        length: 10,
                        orientation: 'right'
                    }
                ]
            },
            footprint: {
                name: 'Fake_Footprint',
                component: { x: 1000, y: 1000, rotation: 0 },
                pads: [
                    {
                        number: '1',
                        x: 950,
                        y: 1000,
                        width: 40,
                        height: 30,
                        layer: 'top'
                    },
                    {
                        number: '2',
                        x: 1050,
                        y: 1000,
                        width: 40,
                        height: 30,
                        layer: 'top'
                    }
                ],
                tracks: [
                    {
                        x1: 900,
                        y1: 900,
                        x2: 1100,
                        y2: 900,
                        width: 6,
                        layer: 'top'
                    }
                ],
                texts: [
                    {
                        text: 'X1',
                        x: 1000,
                        y: 940,
                        height: 40,
                        layer: 'top'
                    }
                ]
            }
        },
        'Fake_Device'
    )

    assert.equal(Array.isArray(adapted.symbol.rawNode), true)
    assert.equal(Array.isArray(adapted.footprint.rawNode), true)

    const result = KicadSelectedPartExporter.export(adapted)
    const symbolText = decodeEntry(result.entries[0])
    const footprintText = decodeEntry(result.entries[1])

    assert.match(symbolText, /\(symbol "Fake_Device"/)
    assert.match(symbolText, /\(pin passive line/)
    assert.match(symbolText, /\(name "IN"/)
    assert.match(symbolText, /\(number "2"/)
    assert.match(footprintText, /\(footprint "Fake_Device"/)
    assert.match(footprintText, /\(pad "1" smd rect/)
    assert.match(footprintText, /\(pad "2" smd rect/)
    assert.match(footprintText, /\(fp_line/)
    assert.match(footprintText, /\(fp_text user "X1"/)
    assert.deepEqual(result.diagnostics, [])
})
