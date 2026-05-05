// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { strFromU8, unzipSync } from 'fflate'
import { ProjectArchive } from '../../src/core/ProjectArchive.mjs'

const fixtureUrl = new URL('../fixtures/minimal.kicad_pcb', import.meta.url)

test('ProjectArchive exports PCB source and settings JSON in a ZIP', async () => {
    const boardSource = await readFile(fixtureUrl, 'utf8')
    const archive = ProjectArchive.create({
        sourceFileName: 'Nested/minimal.kicad_pcb',
        boardSource,
        side: 'back',
        layerStyles: {
            pads: {
                visible: false,
                fillColor: '#123456',
                fillOpacity: 0.4
            }
        },
        highlightedFootprints: ['footprint:U1:0'],
        highlightColor: '#ff4422',
        badges: [{ id: 'badge-1', text: 'A1', x: 12.5, y: 24, side: 'back' }],
        badgeStyle: {
            foregroundColor: '#111111',
            scale: 1.5,
            shadowColor: '#222222',
            shadowOpacity: 0.35,
            shadowBlur: 1.2,
            shadowOffsetX: 0.4,
            shadowOffsetY: 0.5
        }
    })
    const entries = unzipSync(archive)
    const settings = JSON.parse(strFromU8(entries['settings.json']))

    assert.equal(strFromU8(entries['minimal.kicad_pcb']), boardSource)
    assert.equal(settings.app, 'PCB Styler')
    assert.equal(settings.format, 'pcb-styler-project')
    assert.equal(settings.formatVersion, 1)
    assert.equal(settings.pcbFileName, 'minimal.kicad_pcb')
    assert.equal(settings.sourceFileName, 'Nested/minimal.kicad_pcb')
    assert.deepEqual(settings.settings.highlightedFootprints, [
        'footprint:U1:0'
    ])
    assert.deepEqual(settings.settings.badges, [
        { id: 'badge-1', text: 'A1', x: 12.5, y: 24, side: 'back' }
    ])
    assert.equal(settings.settings.layerStyles.pads.visible, false)
    assert.equal(settings.settings.badgeStyle.scale, 1.5)
})
