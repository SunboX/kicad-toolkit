// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'

import { Parser } from '../src/parser.mjs'

const FIXTURE = {
    fileName: 'neutral.kicad_sch',
    data: '(kicad_sch (version 20250114) (generator "fixture") (paper "A4"))'
}

test('KiCad extension resolver returns only retained canonical native models', async () => {
    const { KicadExtensionResolver } = await import('../src/extensions.mjs')
    const canonical = Parser.parse(FIXTURE)
    const retained = Parser.parse(FIXTURE, {
        extensions: ['kicad.native-model']
    })

    assert.equal(KicadExtensionResolver.nativeModel(canonical), null)
    assert.equal(KicadExtensionResolver.hasNativeModel(canonical), false)
    assert.equal(
        KicadExtensionResolver.nativeModel(retained),
        retained.extensions.kicad.native
    )
    assert.equal(KicadExtensionResolver.hasNativeModel(retained), true)

    const wrongSource = {
        ...retained,
        source: { ...retained.source, format: 'altium' }
    }
    assert.equal(KicadExtensionResolver.nativeModel(wrongSource), null)
    assert.equal(KicadExtensionResolver.hasNativeModel(wrongSource), false)
})

test('KiCad extension resolver passes through only owned legacy model markers', async () => {
    const { KicadExtensionResolver } = await import('../src/extensions.mjs')
    const sourceFormatModel = { sourceFormat: 'kicad', objects: [] }
    const urnSchemaModel = {
        schema: 'urn:kicad-toolkit:renderer-model.v1',
        objects: []
    }
    const packageSchemaModel = {
        schema: 'kicad-toolkit.renderer-model.v1',
        objects: []
    }

    assert.equal(
        KicadExtensionResolver.nativeModel(sourceFormatModel),
        sourceFormatModel
    )
    assert.equal(
        KicadExtensionResolver.nativeModel(urnSchemaModel),
        urnSchemaModel
    )
    assert.equal(
        KicadExtensionResolver.nativeModel(packageSchemaModel),
        packageSchemaModel
    )

    const inheritedSourceFormat = Object.create({ sourceFormat: 'kicad' })
    assert.equal(
        KicadExtensionResolver.nativeModel(inheritedSourceFormat),
        null
    )

    let accessorReads = 0
    const accessorSchema = {}
    Object.defineProperty(accessorSchema, 'schema', {
        get() {
            accessorReads += 1
            return 'urn:kicad-toolkit:renderer-model.v1'
        }
    })
    assert.equal(KicadExtensionResolver.nativeModel(accessorSchema), null)
    assert.equal(accessorReads, 0)
})
