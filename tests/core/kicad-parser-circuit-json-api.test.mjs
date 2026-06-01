// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadParser } from '../../src/parser.mjs'

/**
 * Encodes fixture text as an ArrayBuffer.
 * @param {string} source
 * @returns {ArrayBuffer}
 */
function bytesFor(source) {
    const buffer = Buffer.from(source, 'utf8')
    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
    )
}

/**
 * Builds a minimal KiCad PCB fixture.
 * @returns {string}
 */
function minimalPcbSource() {
    return `(kicad_pcb
        (version 20241229)
        (title_block (title "Panel"))
        (gr_poly
            (pts (xy 0 0) (xy 30 0) (xy 30 20) (xy 0 20))
            (stroke (width 0.15) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
        (footprint "Package_SO:SOIC-8"
            (layer "F.Cu")
            (at 10 10 0)
            (property "Reference" "U1"
                (at 0 -3 0)
                (layer "F.SilkS")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (property "Value" "MCU"
                (at 0 3 0)
                (layer "F.Fab")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (pad "1" smd rect
                (at 0 0 0)
                (size 1 1)
                (layers "F.Cu" "F.Mask" "F.Paste")
                (net 1 "GND")
            )
        )
    )`
}

/**
 * Verifies the breaking parser root returns Circuit JSON directly.
 */
test('KicadParser.parseArrayBuffer returns a Circuit JSON array', () => {
    const circuitJson = KicadParser.parseArrayBuffer(
        'panel.kicad_pcb',
        bytesFor(minimalPcbSource())
    )

    assert.equal(Array.isArray(circuitJson), true)
    assert.equal(circuitJson.kind, 'pcb')
    assert.equal(circuitJson.fileType, 'kicad_pcb')
    assert.equal(
        circuitJson.some(
            (element) => element.type === 'source_project_metadata'
        ),
        true
    )
    assert.equal(
        circuitJson.some((element) => element.type === 'pcb_board'),
        true
    )
    assert.equal(
        JSON.parse(JSON.stringify(circuitJson)).every(
            (element) => element.type
        ),
        true
    )
})

/**
 * Verifies the compatibility API keeps returning the renderer model.
 */
test('KicadParser.parseArrayBufferToRendererModel keeps renderer output', () => {
    const rendererModel = KicadParser.parseArrayBufferToRendererModel(
        'panel.kicad_pcb',
        bytesFor(minimalPcbSource())
    )

    assert.equal(Array.isArray(rendererModel), false)
    assert.equal(rendererModel.kind, 'pcb')
    assert.equal(rendererModel.fileType, 'kicad_pcb')
    assert.equal(rendererModel.pcb.components[0].designator, 'U1')
})
