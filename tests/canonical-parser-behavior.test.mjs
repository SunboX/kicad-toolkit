// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'

import { ToolkitContractFixtures } from 'circuitjson-toolkit/testing'
import { CircuitJsonDocument } from 'circuitjson-toolkit'

import { KicadBenchmarkFixtureFactory } from '../benchmarks/KicadBenchmarkFixtureFactory.mjs'
import { KicadParser } from '../src/core/kicad/KicadParser.mjs'
import { Parser } from '../src/parser.mjs'

const FIXTURE = ToolkitContractFixtures.kicad().parserInput

/**
 * Builds a PCB with legacy and blank values plus generic PCB annotations.
 * @returns {string} KiCad PCB source.
 */
function blankTypedValueFixture() {
    return `(kicad_pcb
        (version 20241229)
        (layers
            (0 "F.Cu" signal)
            (31 "B.Cu" signal)
        )
        (footprint "Device:C"
            (layer "F.Cu")
            (at 2 2 45)
            (fp_text reference "C1"
                (at 0 -1 0)
                (layer "F.SilkS")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (fp_text value "10u"
                (at 0 1 0)
                (layer "F.Fab")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (pad "1" smd rect
                (at 0 0 0)
                (size 1 1)
                (layers "F.Cu" "F.Mask" "F.Paste")
            )
            (pad "2" smd rect
                (at 1 0 0)
                (size 1 1)
                (layers "F.Cu" "F.Mask" "F.Paste")
            )
            (fp_line
                (start -1 -1)
                (end 1 -1)
                (stroke (width 0.05) (type solid))
                (layer "F.CrtYd")
            )
            (fp_circle
                (center 0 0)
                (end 1 0)
                (stroke (width 0.05) (type solid))
                (fill none)
                (layer "F.CrtYd")
            )
            (fp_rect
                (start -1 -0.5)
                (end 1 0.5)
                (stroke (width 0.05) (type solid))
                (fill none)
                (layer "F.CrtYd")
            )
            (fp_arc
                (start -1 0)
                (mid 0 1)
                (end 1 0)
                (stroke (width 0.05) (type solid))
                (layer "F.Fab")
            )
        )
        (footprint "Device:C"
            (layer "F.Cu")
            (at 4 2 0)
            (property "Reference" "C2" (at 0 -1 0))
            (property "Value" "" (at 0 1 0))
        )
        (footprint "Connector:Header"
            (layer "F.Cu")
            (at 6 2 0)
            (property "Reference" "J1" (at 0 -1 0))
            (property "Value" "" (at 0 1 0))
            (pad "1" thru_hole circle
                (at 0 0 0)
                (size 1.5 1.5)
                (drill 0.8)
                (layers "*.Cu" "*.Mask")
            )
            (pad "2" thru_hole circle
                (at 2.54 0 0)
                (size 1.5 1.5)
                (drill 0.8)
                (layers "*.Cu" "*.Mask")
            )
        )
        (gr_text "BOARD NOTE"
            (at 4 8 0)
            (layer "Dwgs.User")
            (effects (font (size 1 1) (thickness 0.15)))
        )
    )`
}

test('parser preserves exact byte windows and executes native parsing once', () => {
    const payload = new TextEncoder().encode(FIXTURE.data)
    const container = new Uint8Array(payload.byteLength + 8)
    container.fill(0xa5)
    container.set(payload, 4)
    const before = container.slice()
    const original = KicadParser.parseArrayBuffer
    let calls = 0
    KicadParser.parseArrayBuffer = (...arguments_) => {
        calls += 1
        return Reflect.apply(original, KicadParser, arguments_)
    }
    try {
        const document = Parser.parse({
            fileName: FIXTURE.fileName,
            data: container.subarray(4, 4 + payload.byteLength)
        })
        assert.equal(document.source.format, 'kicad')
        assert.equal(document.schema, 'ecad-toolkit.document.v1')
        assert.deepEqual(container, before)
        assert.equal(calls, 1)
    } finally {
        KicadParser.parseArrayBuffer = original
    }
})

test('parser applies common extension, asset, and source policies', () => {
    const asset = new Uint8Array([1, 2, 3, 4])
    const metadata = Parser.parse(FIXTURE, { extensions: 'metadata' })
    const full = Parser.parse(
        { ...FIXTURE, assets: [{ name: 'model.step', data: asset }] },
        {
            extensions: 'full',
            decodeAssets: 'full',
            retainSource: 'reference'
        }
    )
    const selected = Parser.parse(FIXTURE, {
        extensions: ['kicad.native-model']
    })

    assert.equal(metadata.extensions.kicad.$meta.completeness, 'metadata')
    assert.equal(Object.hasOwn(metadata.extensions.kicad, 'native'), false)
    assert.equal(Object.hasOwn(full.extensions.kicad, 'native'), true)
    assert.equal(Object.hasOwn(selected.extensions.kicad, 'native'), true)
    assert.deepEqual(full.assets[0].data, asset)
    assert.equal(full.sourceReference.fileName, FIXTURE.fileName)
    full.assets[0].data[0] = 99
    assert.deepEqual(asset, new Uint8Array([1, 2, 3, 4]))
})

test('parser adopts owned native extension graphs without recopying ordinary nodes', () => {
    const nativeSummary = { analysis: { copperLayerCount: 2 } }
    const nativeModel = []
    nativeModel.kind = 'pcb'
    nativeModel.summary = nativeSummary
    nativeModel.bom = []
    nativeModel.diagnostics = []
    const original = KicadParser.parseArrayBuffer
    KicadParser.parseArrayBuffer = () => nativeModel
    try {
        const document = Parser.parse(
            {
                fileName: 'owned-graph.kicad_pcb',
                data: '(kicad_pcb)'
            },
            { extensions: 'full' }
        )

        assert.equal(document.extensions.kicad.summary, nativeSummary)
        assert.equal(document.extensions.kicad.native.summary, nativeSummary)
        assert.equal(Object.isFrozen(nativeSummary), true)
        assert.equal(Object.isFrozen(nativeSummary.analysis), true)
    } finally {
        KicadParser.parseArrayBuffer = original
    }
})

test('async parser emits ordered progress and honors cancellation', async () => {
    const controller = new AbortController()
    const stages = []
    await assert.rejects(
        Parser.parseAsync(FIXTURE, {
            worker: false,
            signal: controller.signal,
            onProgress: (row) => {
                stages.push(row.stage)
                if (row.stage === 'validate') controller.abort()
            }
        }),
        (error) => error?.code === 'ERR_CANCELLED'
    )
    assert.deepEqual(stages, ['detect', 'decode', 'validate'])
})

test('parser normalizes the complete native projection to pinned CircuitJSON', () => {
    const document = Parser.parse({
        fileName: 'synthetic-large.kicad_pcb',
        data: KicadBenchmarkFixtureFactory.largeBoardBytes()
    })
    const silkscreenText = document.model.find(
        (row) => row.type === 'pcb_silkscreen_text' && row.text === 'U1'
    )
    const silkscreenOwner = document.model.find(
        (row) =>
            row.type === 'pcb_component' &&
            row.pcb_component_id === silkscreenText.pcb_component_id
    )
    const silkscreenPaths = document.model.filter(
        (row) => row.type === 'pcb_silkscreen_path'
    )

    assert.equal(CircuitJsonDocument.isModel(document.model), true)
    assert.equal(silkscreenText.layer, silkscreenOwner.layer)
    assert.equal(typeof silkscreenText.pcb_component_id, 'string')
    assert.equal(silkscreenPaths.length, 96)
    assert.equal(
        silkscreenPaths.every(
            (row) => Array.isArray(row.route) && row.route.length >= 2
        ),
        true
    )
})

test('parser emits canonical typed values, annotations, and courtyards', () => {
    const document = Parser.parse({
        fileName: 'blank-values.kicad_pcb',
        data: blankTypedValueFixture()
    })
    const sourceComponents = new Map(
        document.model
            .filter((element) => element.type === 'source_component')
            .map((component) => [component.name, component])
    )
    const noteText = document.model.find(
        (element) =>
            element.type === 'pcb_note_text' && element.text === 'BOARD NOTE'
    )
    const fabricationArc = document.model.find(
        (element) =>
            element.type === 'pcb_fabrication_note_path' &&
            element.shape === 'arc'
    )

    assert.equal(CircuitJsonDocument.isModel(document.model), true)
    assert.equal(sourceComponents.get('C1').ftype, 'simple_capacitor')
    assert.equal(sourceComponents.get('C1').display_value, '10u')
    assert.equal(sourceComponents.get('C1').capacitance, '10u')
    assert.equal(sourceComponents.get('C2').ftype, 'simple_chip')
    assert.equal(sourceComponents.get('J1').ftype, 'simple_pin_header')
    assert.equal(sourceComponents.get('J1').pin_count, 2)
    assert.equal(noteText.layer, 'top')
    assert.equal(fabricationArc.route.length > 3, true)
    assert.equal(
        document.model.some((element) => element.type === 'pcb_text'),
        false
    )
    assert.equal(
        document.model.some((element) => element.type === 'pcb_courtyard'),
        false
    )
    assert.equal(
        document.model.some(
            (element) => element.type === 'pcb_courtyard_outline'
        ),
        true
    )
    assert.equal(
        document.model.some(
            (element) => element.type === 'pcb_courtyard_circle'
        ),
        true
    )
    assert.equal(
        document.model.some(
            (element) => element.type === 'pcb_courtyard_polygon'
        ),
        true
    )
    assert.equal(
        document.model.some((element) => element.type === 'pcb_courtyard_rect'),
        false
    )
})
