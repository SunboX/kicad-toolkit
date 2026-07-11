import assert from 'node:assert/strict'
import test from 'node:test'
import {
    KicadSelectedPartExporter,
    SExpressionParser
} from '../../src/legacy-parser.mjs'

/**
 * Decodes one exported text entry.
 * @param {{ bytes: Uint8Array }} entry Export entry.
 * @returns {string}
 */
function decodeEntry(entry) {
    return new TextDecoder().decode(entry.bytes)
}

/**
 * Verifies raw KiCad AST nodes are preserved in selected-part exports.
 */
test('KicadSelectedPartExporter preserves raw selected symbol and footprint nodes', () => {
    const symbolNode = SExpressionParser.parse(
        '(symbol "Device:R" (property "Reference" "R" (at 0 0 0)) (pin passive line (at 0 0 0) (length 2.54) (name "A") (number "1")))'
    )
    const footprintNode = SExpressionParser.parse(
        '(footprint "Resistor_SMD:R_0603" (layer "F.Cu") (property "Reference" "R1" (at 0 0 0)) (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu")))'
    )

    const result = KicadSelectedPartExporter.export({
        designator: 'R1',
        symbol: { name: 'Device:R', rawNode: symbolNode },
        footprint: { name: 'Resistor_SMD:R_0603', rawNode: footprintNode }
    })

    assert.equal(result.entries.length, 2)
    assert.match(decodeEntry(result.entries[0]), /\(kicad_symbol_lib/)
    assert.match(decodeEntry(result.entries[0]), /\(symbol "Device:R"/)
    assert.match(
        decodeEntry(result.entries[1]),
        /\(footprint "Resistor_SMD:R_0603"/
    )
    assert.deepEqual(result.diagnostics, [])
})

/**
 * Verifies normalized data can still produce a best-effort KiCad part.
 */
test('KicadSelectedPartExporter generates fallback nodes with diagnostics', () => {
    const result = KicadSelectedPartExporter.export({
        designator: 'U1',
        symbol: { name: 'Logic IC', pins: [{ name: 'IN', number: '1' }] },
        footprint: { name: 'SOIC-8', pads: [{ number: '1', x: 0, y: 0 }] }
    })

    const symbolText = decodeEntry(result.entries[0])
    const footprintText = decodeEntry(result.entries[1])

    assert.match(symbolText, /\(symbol "Logic_IC"/)
    assert.match(symbolText, /\(pin passive line/)
    assert.match(footprintText, /\(footprint "SOIC-8"/)
    assert.match(footprintText, /\(pad "1" smd rect/)
    assert.equal(result.diagnostics.length, 2)
})
