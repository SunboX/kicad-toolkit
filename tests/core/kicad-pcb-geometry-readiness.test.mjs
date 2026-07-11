// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadPcbGeometryReadinessReportBuilder } from '../../src/legacy-parser.mjs'

test('KicadPcbGeometryReadinessReportBuilder reports rendering-sensitive geometry', () => {
    const report = KicadPcbGeometryReadinessReportBuilder.build(
        createGeometryRiskyPcb()
    )

    assert.equal(report.schema, 'kicad-toolkit.pcb.geometry-readiness.a1')
    assert.deepEqual(report.summary, {
        findingCount: 6,
        warningCount: 3,
        infoCount: 3,
        thickArcCount: 1,
        multiContourZoneCount: 1,
        missingSavedZoneFillCount: 0,
        invalidSavedFillCount: 0,
        tinySavedFillIslandCount: 0,
        droppedSavedFillRingCount: 0,
        curvePrimitiveCount: 2,
        textBoxCount: 1,
        customPadCount: 1,
        missingCourtyardCount: 0,
        courtyardUndercoverageCount: 0
    })
    assert.deepEqual(
        report.findings.map((finding) => finding.code),
        [
            'kicad.pcb.geometry.thick-arc',
            'kicad.pcb.geometry.curve-primitive',
            'kicad.pcb.geometry.multi-contour-zone',
            'kicad.pcb.geometry.text-box',
            'kicad.pcb.geometry.custom-pad',
            'kicad.pcb.geometry.custom-pad-curve'
        ]
    )
    assert.deepEqual(report.indexes.findingsBySeverity.warning, [
        'geometry-0',
        'geometry-2',
        'geometry-4'
    ])
    assert.deepEqual(report.indexes.findingsByConstruct.curve, [
        'geometry-1',
        'geometry-5'
    ])
})

test('KicadPcbGeometryReadinessReportBuilder reports courtyard extent readiness', () => {
    const report = KicadPcbGeometryReadinessReportBuilder.build({
        footprints: [
            {
                id: 'footprint:U1:0',
                reference: 'U1',
                pads: [
                    {
                        id: 'pad-u1-1',
                        shape: 'rect',
                        x: 0,
                        y: 0,
                        width: 2,
                        height: 1,
                        rotation: 0
                    }
                ],
                drawings: []
            },
            {
                id: 'footprint:U2:1',
                reference: 'U2',
                pads: [
                    {
                        id: 'pad-u2-1',
                        shape: 'rect',
                        x: 0,
                        y: 0,
                        width: 2,
                        height: 2,
                        rotation: 0
                    }
                ],
                drawings: [
                    {
                        id: 'crtyd-u2',
                        type: 'polygon',
                        layer: 'F.CrtYd',
                        points: [
                            { x: -0.5, y: -0.5 },
                            { x: 0.5, y: -0.5 },
                            { x: 0.5, y: 0.5 },
                            { x: -0.5, y: 0.5 }
                        ]
                    }
                ]
            }
        ]
    })

    assert.equal(report.summary.missingCourtyardCount, 1)
    assert.equal(report.summary.courtyardUndercoverageCount, 1)
    assert.deepEqual(
        report.findings.map((finding) => finding.code),
        [
            'kicad.pcb.geometry.footprint-missing-courtyard',
            'kicad.pcb.geometry.footprint-courtyard-undercoverage'
        ]
    )
    assert.deepEqual(report.findings[1].padBounds, {
        minX: -1,
        minY: -1,
        maxX: 1,
        maxY: 1,
        width: 2,
        height: 2
    })
})

test('KicadPcbGeometryReadinessReportBuilder reports zones without saved fills', () => {
    const report = KicadPcbGeometryReadinessReportBuilder.build({
        zoneSemantics: [
            {
                zoneIndex: 0,
                layerKey: 'F.Cu',
                netName: 'GND',
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                    { x: 10, y: 10 },
                    { x: 0, y: 10 }
                ]
            },
            {
                zoneIndex: 1,
                layerKey: 'B.Cu',
                isKeepout: true,
                keepoutTargets: { copperpour: true },
                points: [
                    { x: 20, y: 20 },
                    { x: 30, y: 20 },
                    { x: 30, y: 30 },
                    { x: 20, y: 30 }
                ]
            },
            {
                zoneIndex: 2,
                layerKey: 'B.Cu',
                netName: 'GND',
                points: [
                    { x: 40, y: 40 },
                    { x: 50, y: 40 },
                    { x: 50, y: 50 },
                    { x: 40, y: 50 }
                ]
            }
        ],
        polygons: [
            {
                id: 'zone-2',
                type: 'zone',
                sourceType: 'zone',
                zoneIndex: 2,
                layer: 'B.Cu',
                points: [
                    { x: 40, y: 40 },
                    { x: 50, y: 40 },
                    { x: 50, y: 50 },
                    { x: 40, y: 50 }
                ]
            }
        ]
    })

    assert.equal(report.summary.missingSavedZoneFillCount, 1)
    assert.deepEqual(
        report.findings.map((finding) => finding.code),
        ['kicad.pcb.geometry.zone-fill-not-saved']
    )
    assert.deepEqual(report.findings[0], {
        key: 'geometry-0',
        severity: 'warning',
        code: 'kicad.pcb.geometry.zone-fill-not-saved',
        construct: 'zone',
        sourceKey: 'zone-0',
        layer: 'F.Cu',
        netName: 'GND',
        message:
            'KiCad PCB copper zone has an outline but no saved filled polygon geometry.'
    })
})

test('KicadPcbGeometryReadinessReportBuilder reports invalid saved fill islands', () => {
    const report = KicadPcbGeometryReadinessReportBuilder.build({
        polygons: [
            {
                id: 'zone-invalid',
                type: 'zone',
                layer: 'F.Cu',
                points: [
                    { x: 0, y: 0 },
                    { x: 1, y: 1 },
                    { x: 2, y: 2 }
                ]
            },
            {
                id: 'zone-tiny',
                type: 'zone',
                layer: 'F.Cu',
                brep_shapes: [
                    {
                        outer_ring: {
                            vertices: [
                                { x: 10, y: 10 },
                                { x: 10.000001, y: 10 },
                                { x: 10.000001, y: 10.000001 },
                                { x: 10, y: 10.000001 }
                            ]
                        }
                    }
                ]
            },
            {
                id: 'zone-tiny-singular',
                type: 'zone',
                layer: 'B.Cu',
                brep_shape: {
                    outer_ring: {
                        vertices: [
                            { x: 11, y: 11 },
                            { x: 11.000001, y: 11 },
                            { x: 11.000001, y: 11.000001 },
                            { x: 11, y: 11.000001 }
                        ]
                    }
                }
            },
            {
                id: 'zone-good',
                type: 'zone',
                layer: 'F.Cu',
                points: [
                    { x: 20, y: 20 },
                    { x: 30, y: 20 },
                    { x: 30, y: 30 },
                    { x: 20, y: 30 }
                ]
            }
        ]
    })

    assert.equal(report.summary.invalidSavedFillCount, 1)
    assert.equal(report.summary.tinySavedFillIslandCount, 2)
    assert.deepEqual(
        report.findings.map((finding) => finding.code),
        [
            'kicad.pcb.geometry.saved-fill-invalid',
            'kicad.pcb.geometry.saved-fill-tiny-island',
            'kicad.pcb.geometry.saved-fill-tiny-island'
        ]
    )
    assert.equal(report.findings[1].islandArea, 0)
    assert.equal(report.findings[2].sourceKey, 'zone-tiny-singular')
})

test('KicadPcbGeometryReadinessReportBuilder reports dropped saved fill rings', () => {
    const report = KicadPcbGeometryReadinessReportBuilder.build({
        polygons: [
            {
                id: 'zone-duplicate-ring',
                type: 'zone',
                layer: 'F.Cu',
                brep_shape: {
                    outer_ring: {
                        vertices: [
                            { x: 0, y: 0 },
                            { x: 0, y: 0 },
                            { x: 0, y: 0 }
                        ]
                    }
                }
            },
            {
                id: 'zone-non-finite-ring',
                type: 'zone',
                layer: 'F.Cu',
                brep_shape: {
                    outer_ring: {
                        vertices: [
                            { x: 0, y: 0 },
                            { x: Infinity, y: 0 },
                            { x: 10, y: 10 },
                            { x: 0, y: 10 }
                        ]
                    }
                }
            },
            {
                id: 'zone-collapsed-ring',
                type: 'zone',
                layer: 'B.Cu',
                brep_shape: {
                    outer_ring: {
                        vertices: [
                            { x: 10, y: 10 },
                            { x: 10.01, y: 10 },
                            { x: 10.02, y: 10 },
                            { x: 10.03, y: 10 }
                        ]
                    }
                }
            },
            {
                id: 'zone-valid-with-dropped-hole',
                type: 'zone',
                layer: 'B.Cu',
                brep_shape: {
                    outer_ring: {
                        vertices: [
                            { x: 20, y: 20 },
                            { x: 40, y: 20 },
                            { x: 40, y: 40 },
                            { x: 20, y: 40 }
                        ]
                    },
                    inner_rings: [
                        {
                            vertices: [
                                { x: 25, y: 25 },
                                { x: 25, y: 25 },
                                { x: 25, y: 25 }
                            ]
                        }
                    ]
                }
            }
        ]
    })

    assert.equal(report.summary.droppedSavedFillRingCount, 4)
    assert.deepEqual(
        report.findings.map((finding) => finding.code),
        [
            'kicad.pcb.geometry.saved-fill-ring-dropped',
            'kicad.pcb.geometry.saved-fill-ring-dropped',
            'kicad.pcb.geometry.saved-fill-ring-dropped',
            'kicad.pcb.geometry.saved-fill-ring-dropped'
        ]
    )
    assert.deepEqual(
        report.findings.map((finding) => finding.dropReason),
        [
            'too-few-points',
            'non-finite-point',
            'near-zero-area',
            'too-few-points'
        ]
    )
    assert.deepEqual(
        report.findings.map((finding) => finding.ringRole),
        ['outer', 'outer', 'outer', 'hole']
    )
})

/**
 * Builds a fake PCB with rendering and readiness edge cases.
 * @returns {object}
 */
function createGeometryRiskyPcb() {
    return {
        arcs: [
            {
                id: 'arc-0',
                layer: 'F.Cu',
                width: 2.4,
                radius: 1,
                sourceType: 'arc'
            }
        ],
        drawings: [
            {
                id: 'curve-0',
                type: 'curve',
                sourceType: 'gr_curve',
                layer: 'F.SilkS',
                points: [
                    { x: 0, y: 0 },
                    { x: 1, y: 1 },
                    { x: 2, y: -1 },
                    { x: 3, y: 0 }
                ]
            },
            {
                id: 'text-box-0',
                type: 'text_box',
                sourceType: 'gr_text_box',
                layer: 'F.SilkS',
                value: 'BOX'
            }
        ],
        pads: [
            {
                id: 'pad-custom-0',
                shape: 'custom',
                customPrimitives: [
                    {
                        type: 'curve',
                        points: [
                            { x: -0.5, y: 0 },
                            { x: 0, y: 0.4 },
                            { x: 0.5, y: 0 }
                        ]
                    }
                ]
            }
        ],
        polygons: [
            {
                id: 'zone-0',
                type: 'zone',
                layer: 'F.Cu',
                contours: [[{ x: 0, y: 0 }], [{ x: 1, y: 1 }]]
            }
        ]
    }
}
