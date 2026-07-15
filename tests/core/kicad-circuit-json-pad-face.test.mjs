// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadParser } from '../../src/legacy-parser.mjs'

test('KicadParser projects an SMD pad from its authored copper face', () => {
    const circuitJson = KicadParser.parseArrayBuffer(
        'neutral-pad-face.kicad_pcb',
        bytesFor(bottomPadPcbSource())
    )
    const smtPad = circuitJson.find((element) => {
        return element.type === 'pcb_smtpad'
    })
    const pcbPort = circuitJson.find((element) => {
        return element.type === 'pcb_port'
    })
    const pcbComponent = circuitJson.find((element) => {
        return element.type === 'pcb_component'
    })

    assert.deepEqual(
        {
            layer: smtPad.layer,
            x: smtPad.x,
            y: smtPad.y,
            width: smtPad.width,
            height: smtPad.height,
            cornerRadius: smtPad.corner_radius,
            isCoveredWithSolderMask: smtPad.is_covered_with_solder_mask,
            solderMaskMargin: smtPad.soldermask_margin,
            portLayers: pcbPort.layers,
            padOwner: smtPad.pcb_component_id,
            portOwner: pcbPort.pcb_component_id
        },
        {
            layer: 'bottom',
            x: 6.2,
            y: 3.9,
            width: 0.8,
            height: 1.2,
            cornerRadius: 0.2,
            isCoveredWithSolderMask: false,
            solderMaskMargin: 0.05,
            portLayers: ['bottom'],
            padOwner: pcbComponent.pcb_component_id,
            portOwner: pcbComponent.pcb_component_id
        }
    )
})

/**
 * Encodes a source fixture for the parser.
 * @param {string} source KiCad source.
 * @returns {Uint8Array}
 */
function bytesFor(source) {
    return new TextEncoder().encode(source)
}

/**
 * Builds a neutral board with one rotated bottom SMD pad.
 * @returns {string}
 */
function bottomPadPcbSource() {
    return `(kicad_pcb
        (version 20250101)
        (gr_rect
            (start 0 0)
            (end 12 8)
            (stroke (width 0.1) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
        (footprint "Package:Neutral"
            (layer "B.Cu")
            (at 6 4 0)
            (property "Reference" "U1"
                (at 0 -2 0)
                (layer "B.SilkS")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (pad "1" smd roundrect
                (at 0 0 90)
                (size 1.2 0.8)
                (layers "B.Cu" "B.Mask" "B.Paste")
                (roundrect_rratio 0.25)
                (solder_mask_margin 0.05)
                (padstack
                    (mode custom)
                    (layer "B.Cu"
                        (shape roundrect)
                        (size 1.2 0.8)
                        (offset 0.1 0.2)
                        (roundrect_rratio 0.25)
                    )
                )
            )
        )
    )`
}
