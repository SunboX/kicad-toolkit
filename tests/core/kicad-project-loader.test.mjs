// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { strToU8, zipSync } from 'fflate'
import { KicadProjectLoader } from '../../src/core/KicadProjectLoader.mjs'

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

test('KicadProjectLoader restores legacy project settings from zip', async () => {
    const source = await readFile(fixtureUrl, 'utf8')
    const archive = zipSync({
        'minimal.kicad_pcb': strToU8(source),
        'settings.json': strToU8(
            JSON.stringify({
                format: 'pcb-marker-project',
                formatVersion: 1,
                pcbFileName: 'minimal.kicad_pcb',
                settings: {
                    side: 'back',
                    highlightColor: '#ff4422',
                    highlightedFootprints: ['footprint:U1:0'],
                    badges: [
                        {
                            id: 'badge-1',
                            text: '1',
                            x: 10,
                            y: 20,
                            side: 'back'
                        }
                    ]
                }
            })
        )
    })

    const result = await KicadProjectLoader.loadEntries([
        {
            name: 'Legacy-Project.zip',
            bytes: archive
        }
    ])

    assert.equal(result.board.title, 'Tiny Board')
    assert.equal(result.sourceFileName, 'minimal.kicad_pcb')
    assert.equal(result.sourceText, source)
    assert.deepEqual(result.projectSettings, {
        side: 'back',
        highlightColor: '#ff4422',
        highlightedFootprints: ['footprint:U1:0'],
        badges: [
            {
                id: 'badge-1',
                text: '1',
                x: 10,
                y: 20,
                side: 'back'
            }
        ]
    })
})
