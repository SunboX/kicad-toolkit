// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { strToU8, zipSync } from 'fflate'
import { KicadProjectLoader } from '../../src/core/kicad/KicadProjectLoader.mjs'

test('KicadProjectLoader loads a full KiCad project from named entries', async () => {
    const result = await KicadProjectLoader.loadEntries(projectEntries())

    assert.equal(result.project.name, 'demo')
    assert.equal(result.documents.length, 3)
    assert.equal(result.diagnostics.length, 0)
    assert.equal(
        result.documents.every((document) => Array.isArray(document)),
        true
    )
    assert.ok(result.documents.some((document) => document.kind === 'pcb'))
    assert.equal(
        result.documents.filter((document) => document.kind === 'schematic')
            .length,
        2
    )
    assert.ok(
        result.project.nets.some((net) => {
            return (
                net.name === 'ROOT_TO_CHILD' &&
                net.sheetNames.includes('demo.kicad_sch') &&
                net.sheetNames.includes('child.kicad_sch')
            )
        }),
        'expected project nets to merge matching sheet pins and hierarchical labels'
    )
    assert.deepEqual(result.project.bom[0].designators, ['U1'])
})

test('KicadProjectLoader loads a full KiCad project from a zip archive', async () => {
    const archive = zipSync(
        Object.fromEntries(
            projectEntries().map((entry) => [entry.name, entry.bytes])
        )
    )
    const result = await KicadProjectLoader.loadEntries([
        {
            name: 'demo.zip',
            bytes: archive
        }
    ])

    assert.equal(result.project.name, 'demo')
    assert.equal(result.documents.length, 3)
    assert.ok(result.project.nets.some((net) => net.name === 'ROOT_TO_CHILD'))
})

test('KicadProjectLoader reports missing schematic sheets as diagnostics', async () => {
    const entries = projectEntries().filter((entry) => {
        return !entry.name.endsWith('child.kicad_sch')
    })
    const result = await KicadProjectLoader.loadEntries(entries)

    assert.equal(result.project.name, 'demo')
    assert.ok(
        result.diagnostics.some((diagnostic) =>
            diagnostic.message.includes(
                'Missing schematic sheet child.kicad_sch'
            )
        )
    )
})

/**
 * Builds fake full-project entries.
 * @returns {{ name: string, bytes: Uint8Array }[]}
 */
function projectEntries() {
    return [
        {
            name: 'demo/demo.kicad_pro',
            bytes: strToU8('{"meta":{"version":1}}')
        },
        {
            name: 'demo/demo.kicad_sch',
            bytes: strToU8(rootSchematicSource())
        },
        {
            name: 'demo/child.kicad_sch',
            bytes: strToU8(childSchematicSource())
        },
        {
            name: 'demo/demo.kicad_pcb',
            bytes: strToU8(boardSource())
        }
    ]
}

/**
 * Builds root schematic source with one hierarchical sheet.
 * @returns {string}
 */
function rootSchematicSource() {
    return `(kicad_sch
        (version 20250114)
        (uuid "root")
        (paper "A4")
        (title_block (title "Root"))
        (sheet (at 30 30) (size 20 12)
            (property "Sheet name" "Child" (at 30 28 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Sheet file" "child.kicad_sch" (at 30 44 0)
                (effects (font (size 1.27 1.27)))
            )
            (pin "ROOT_TO_CHILD" input (at 30 36 180)
                (effects (font (size 1.27 1.27)))
                (uuid "root-pin")
            )
            (uuid "sheet-uuid")
        )
    )`
}

/**
 * Builds child schematic source with matching hierarchical label and BOM item.
 * @returns {string}
 */
function childSchematicSource() {
    return `(kicad_sch
        (version 20250114)
        (uuid "child")
        (paper "A4")
        (title_block (title "Child"))
        (lib_symbols
            (symbol "Device:C"
                (pin passive line (at -2.54 0 0) (length 2.54)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "1" (effects (font (size 1.27 1.27))))
                )
                (pin passive line (at 2.54 0 180) (length 2.54)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "2" (effects (font (size 1.27 1.27))))
                )
            )
        )
        (hierarchical_label "ROOT_TO_CHILD" (shape input) (at 10 20 0)
            (effects (font (size 1.27 1.27)))
        )
        (symbol "Device:C" (at 15 20 0) (unit 1)
            (property "Reference" "U1" (at 15 16 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "100n" (at 15 24 0)
                (effects (font (size 1.27 1.27)))
            )
            (uuid "child-symbol")
        )
    )`
}

/**
 * Builds a minimal board source.
 * @returns {string}
 */
function boardSource() {
    return `(kicad_pcb
        (version 20241229)
        (title_block (title "Demo Board"))
        (gr_poly
            (pts (xy 0 0) (xy 10 0) (xy 10 10) (xy 0 10))
            (stroke (width 0.15) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
    )`
}
