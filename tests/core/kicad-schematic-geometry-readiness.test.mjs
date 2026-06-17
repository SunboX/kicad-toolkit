// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    KicadParser,
    KicadSchematicGeometryReadinessReportBuilder
} from '../../src/parser.mjs'

test('KicadSchematicGeometryReadinessReportBuilder summarizes schematic fidelity-sensitive geometry', () => {
    const report = KicadSchematicGeometryReadinessReportBuilder.build({
        beziers: [{ uuid: 'bezier-a', points: [] }],
        arcs: [
            {
                uuid: 'long-arc',
                start: { x: 1, y: 0 },
                mid: { x: 0, y: -1 },
                end: { x: 0, y: 1 }
            },
            {
                uuid: 'flat-arc',
                start: { x: 0, y: 0 },
                mid: { x: 1, y: 0 },
                end: { x: 2, y: 0 }
            }
        ],
        rectangles: [
            {
                uuid: 'rounded-rect',
                radius: 1.25,
                fill: 'hatched',
                lineWidth: -0.2
            }
        ],
        textBoxes: [{ uuid: 'box-a', text: 'Line A\nLine B' }],
        tables: [
            {
                uuid: 'table-a',
                cells: [{ uuid: 'cell-a', text: 'Name\nValue' }]
            }
        ],
        pins: [
            { designator: '1', pinStyle: 'triangle' },
            { designator: '2', pinStyle: 'inverted' }
        ],
        kicadAst: ['kicad_sch', ['freeform_shape', ['uuid', 'unknown-a']]]
    })

    assert.equal(report.schema, 'kicad-toolkit.schematic.geometry-readiness.a1')
    assert.deepEqual(report.summary, {
        findingCount: 10,
        warningCount: 6,
        infoCount: 4,
        bezierCount: 1,
        longArcCount: 1,
        degenerateArcCount: 1,
        roundedRectangleCount: 1,
        textFrameCount: 2,
        multilineTextFrameCount: 2,
        unusualFillCount: 1,
        unusualStrokeCount: 1,
        unsupportedPinStyleCount: 1,
        pinOutsideBodyCount: 0,
        fieldOutsideBodyCount: 0,
        unknownGraphicCount: 1
    })
    assert.deepEqual(
        report.findings.map((finding) => finding.code),
        [
            'kicad.schematic.geometry.bezier',
            'kicad.schematic.geometry.long-arc',
            'kicad.schematic.geometry.degenerate-arc',
            'kicad.schematic.geometry.rounded-rectangle',
            'kicad.schematic.geometry.multiline-text-frame',
            'kicad.schematic.geometry.multiline-table-cell',
            'kicad.schematic.geometry.unusual-fill',
            'kicad.schematic.geometry.unusual-stroke',
            'kicad.schematic.geometry.unsupported-pin-style',
            'kicad.schematic.geometry.unknown-root-node'
        ]
    )
    assert.deepEqual(report.indexes.findingsByConstruct.arc, [
        'schematic-geometry-1',
        'schematic-geometry-2'
    ])
})

test('KicadSchematicGeometryReadinessReportBuilder reports symbol body extent mismatches', () => {
    const report = KicadSchematicGeometryReadinessReportBuilder.build({
        rectangles: [
            {
                uuid: 'body-u1',
                ownerIndex: 'symbol-u1',
                start: { x: -2, y: -2 },
                end: { x: 2, y: 2 }
            }
        ],
        pins: [
            {
                designator: '1',
                ownerIndex: 'symbol-u1',
                x: 8,
                y: 0,
                length: 2,
                orientation: 'left',
                visible: true
            },
            {
                designator: '2',
                ownerIndex: 'symbol-u1',
                x: -2,
                y: 0,
                length: 2,
                orientation: 'right',
                visible: true
            }
        ],
        texts: [
            {
                id: 'field-u1-reference',
                ownerIndex: 'symbol-u1',
                propertyName: 'Reference',
                text: 'U1',
                x: 9,
                y: 0
            }
        ]
    })

    assert.equal(report.summary.pinOutsideBodyCount, 1)
    assert.equal(report.summary.fieldOutsideBodyCount, 1)
    assert.deepEqual(
        report.findings.map((finding) => ({
            code: finding.code,
            construct: finding.construct,
            sourceKey: finding.sourceKey,
            ownerIndex: finding.ownerIndex,
            bounds: finding.bodyBounds
        })),
        [
            {
                code: 'kicad.schematic.geometry.pin-outside-symbol-body',
                construct: 'pin',
                sourceKey: '1',
                ownerIndex: 'symbol-u1',
                bounds: {
                    minX: -2,
                    minY: -2,
                    maxX: 2,
                    maxY: 2,
                    width: 4,
                    height: 4
                }
            },
            {
                code: 'kicad.schematic.geometry.field-outside-symbol-body',
                construct: 'field',
                sourceKey: 'field-u1-reference',
                ownerIndex: 'symbol-u1',
                bounds: {
                    minX: -2,
                    minY: -2,
                    maxX: 2,
                    maxY: 2,
                    width: 4,
                    height: 4
                }
            }
        ]
    )
})

test('KicadParser attaches schematic geometry readiness sidecars', () => {
    const document = KicadParser.parseArrayBufferToRendererModel(
        'readiness.kicad_sch',
        bytesFor(`(kicad_sch
            (version 20250114)
            (paper "A4")
            (rectangle
                (start 10 10)
                (end 20 16)
                (radius 1.5)
                (stroke (width 0.15) (type solid))
                (fill (type none))
                (uuid "rounded-source")
            )
            (bezier
                (pts (xy 30 10) (xy 34 8) (xy 36 18) (xy 40 16))
                (stroke (width 0.1) (type solid))
                (fill (type none))
                (uuid "bezier-source")
            )
        )`)
    )

    assert.equal(
        document.schematic.geometryReadiness.schema,
        'kicad-toolkit.schematic.geometry-readiness.a1'
    )
    assert.equal(document.schematic.geometryReadiness.summary.bezierCount, 1)
    assert.equal(
        document.schematic.geometryReadiness.summary.roundedRectangleCount,
        1
    )
    assert.deepEqual(
        document.schematic.geometryReadiness.indexes.findingsByConstruct
            .rectangle,
        ['schematic-geometry-1']
    )
})

/**
 * Encodes a fixture source as bytes.
 * @param {string} source Source fixture.
 * @returns {Uint8Array}
 */
function bytesFor(source) {
    return new TextEncoder().encode(source)
}
