// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'

import { zipSync } from 'fflate'
import { ToolkitContractFixtures } from 'circuitjson-toolkit/testing'

import { ProjectLoader } from '../src/project.mjs'

const FIXTURE = ToolkitContractFixtures.kicad()

test('project loader accepts app entries and expands one ZIP blob internally', () => {
    const encoded = new TextEncoder().encode(FIXTURE.parserInput.data)
    const archive = zipSync({ 'project/contract.kicad_pcb': encoded })

    const direct = ProjectLoader.load([
        { name: FIXTURE.parserInput.fileName, data: encoded }
    ])
    const zipped = ProjectLoader.load([{ name: 'contract.zip', data: archive }])

    assert.equal(direct.schema, 'ecad-toolkit.project.v1')
    assert.equal(zipped.schema, 'ecad-toolkit.project.v1')
    assert.equal(direct.documents.length, 1)
    assert.equal(zipped.documents.length, 1)
    assert.equal(zipped.documents[0].source.format, 'kicad')
    assert.equal(zipped.extensions.kicad.archiveExpanded, true)
})

test('project loader rejects unsafe ZIP paths and counts expanded bytes', () => {
    const encoded = new TextEncoder().encode(FIXTURE.parserInput.data)
    const unsafe = zipSync({ '../escape.kicad_pcb': encoded })
    assert.throws(
        () => ProjectLoader.load([{ name: 'unsafe.zip', data: unsafe }]),
        (error) => error?.code === 'ERR_ARCHIVE_PATH'
    )

    const archive = zipSync({ 'contract.kicad_pcb': encoded })
    assert.throws(
        () =>
            ProjectLoader.load([{ name: 'contract.zip', data: archive }], {
                archiveLimits: {
                    maxTotalBytes: archive.byteLength + encoded.byteLength - 1
                }
            }),
        (error) => error?.code === 'ERR_ARCHIVE_LIMIT_EXCEEDED'
    )
})

test('canonical project output is directly consumable by shared services', async () => {
    const toolkit = await import('../src/index.mjs')
    const project = ProjectLoader.load(FIXTURE.projectEntries)
    const document = project.documents[0]
    const context = toolkit.CircuitJsonDocumentContext.prepare(document)

    assert.equal(context.document, document)
    assert.match(toolkit.PcbSvgRenderer.render(context), /^<svg/u)
    assert.equal(
        toolkit.PcbScene3dBuilder.build(context).schema,
        'ecad-toolkit.scene3d.v1'
    )
    assert.equal(
        (await toolkit.PcbScene3dPreparator.prepare(context)).schema,
        'ecad-toolkit.scene3d.v1'
    )
})
