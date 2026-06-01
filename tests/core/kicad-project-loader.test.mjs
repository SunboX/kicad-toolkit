// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { strToU8, zipSync } from 'fflate'
import { KicadProjectLoader } from '../../src/core/kicad/KicadProjectLoader.mjs'

const fixtureUrl = new URL('../fixtures/minimal.kicad_pcb', import.meta.url)

test('KicadProjectLoader loads a direct .kicad_pcb entry', async () => {
    const source = await readFile(fixtureUrl)
    const result = await KicadProjectLoader.loadEntries([
        {
            name: 'minimal.kicad_pcb',
            bytes: new Uint8Array(source)
        }
    ])

    assert.equal(result.board.title, 'Tiny Board')
    assert.equal(result.sourceFileName, 'minimal.kicad_pcb')
    assert.equal(Array.isArray(result.documents[0]), true)
    assert.equal(result.documents[0].kind, 'pcb')
})

test('KicadProjectLoader finds the first board file inside a KiCad project zip', async () => {
    const source = await readFile(fixtureUrl, 'utf8')
    const archive = zipSync({
        'Project/notes.txt': strToU8('not a board'),
        'Project/minimal.kicad_pcb': strToU8(source)
    })

    const result = await KicadProjectLoader.loadEntries([
        {
            name: 'Project.zip',
            bytes: archive
        }
    ])

    assert.equal(result.board.title, 'Tiny Board')
    assert.equal(result.sourceFileName, 'Project/minimal.kicad_pcb')
})
