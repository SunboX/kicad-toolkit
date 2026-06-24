// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { Geometry } from './Geometry.mjs'
import { KicadLayerResolver } from './KicadLayerResolver.mjs'
import { KicadPcbDrawingParser } from './KicadPcbDrawingParser.mjs'
import { KicadPcbPadParser } from './KicadPcbPadParser.mjs'
import { KicadSavedFillRingNormalizer } from './KicadSavedFillRingNormalizer.mjs'

const schemaId = 'kicad-toolkit.pcb.geometry-readiness.a1'
const boundsTolerance = 0.001
const minimumSavedFillArea = boundsTolerance * boundsTolerance

/**
 * Builds rendering-sensitive PCB geometry readiness reports.
 */
export class KicadPcbGeometryReadinessReportBuilder {
    /**
     * Builds a deterministic PCB geometry readiness report.
     * @param {object} pcb KiCad PCB model or normalized PCB sidecar.
     * @returns {object}
     */
    static build(pcb = {}) {
        const findings = keyedFindings([
            ...thickArcFindings(pcb),
            ...curveFindings(pcb),
            ...multiContourZoneFindings(pcb),
            ...zoneFillNotSavedFindings(pcb),
            ...savedZoneFillQualityFindings(pcb),
            ...savedFillRingDroppedFindings(pcb),
            ...textBoxFindings(pcb),
            ...customPadFindings(pcb),
            ...courtyardFindings(pcb)
        ])

        return {
            schema: schemaId,
            summary: summary(pcb, findings),
            findings,
            indexes: {
                findingsBySeverity: keysBy(findings, 'severity'),
                findingsByConstruct: keysBy(findings, 'construct')
            }
        }
    }
}

/**
 * Builds findings for thick arcs.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function thickArcFindings(pcb) {
    return (pcb.arcs || []).filter(isThickArc).map((arc) => ({
        severity: 'warning',
        code: 'kicad.pcb.geometry.thick-arc',
        construct: 'arc',
        sourceKey: sourceKey(arc),
        message: 'KiCad PCB arc stroke is at least as thick as the arc radius.'
    }))
}

/**
 * Builds findings for curve primitives.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function curveFindings(pcb) {
    return [...(pcb.drawings || []), ...(sourceBoard(pcb).drawings || [])]
        .filter((drawing) => String(drawing?.type || '') === 'curve')
        .map((drawing) => ({
            severity: 'info',
            code: 'kicad.pcb.geometry.curve-primitive',
            construct: 'curve',
            sourceKey: sourceKey(drawing),
            message:
                'KiCad PCB curve primitive should be rendered from preserved control points.'
        }))
}

/**
 * Builds findings for multi-contour zones.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function multiContourZoneFindings(pcb) {
    return [...(pcb.polygons || []), ...(pcb.drawings || [])]
        .filter((zone) => {
            return (
                String(zone?.type || '') === 'zone' &&
                (zone.contours || []).length > 1
            )
        })
        .map((zone) => ({
            severity: 'warning',
            code: 'kicad.pcb.geometry.multi-contour-zone',
            construct: 'zone',
            sourceKey: sourceKey(zone),
            message:
                'KiCad PCB zone has multiple contours and needs even-odd fill handling.'
        }))
}

/**
 * Builds findings for copper zones whose filled polygons are not saved.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function zoneFillNotSavedFindings(pcb) {
    const savedZoneFills = savedZoneFillRows(pcb)

    return zoneSemanticRows(pcb)
        .filter(isCopperZoneSemantic)
        .filter((zone) => !hasSavedZoneFill(zone, savedZoneFills))
        .map((zone, index) => ({
            severity: 'warning',
            code: 'kicad.pcb.geometry.zone-fill-not-saved',
            construct: 'zone',
            sourceKey: semanticZoneSourceKey(zone, index),
            layer: zoneLayer(zone),
            netName: String(zone?.netName || zone?.net || ''),
            message:
                'KiCad PCB copper zone has an outline but no saved filled polygon geometry.'
        }))
}

/**
 * Builds findings for invalid or tiny saved zone fill islands.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function savedZoneFillQualityFindings(pcb) {
    const findings = []

    for (const zone of savedZoneRows(pcb)) {
        const contours = savedFillContours(zone).filter((contour) => {
            return pointCount(contour) >= 3
        })
        if (contours.length === 0) continue

        const invalidContours = contours.filter((contour) => {
            return polygonArea(contour) === 0
        })
        if (invalidContours.length > 0) {
            findings.push({
                severity: 'warning',
                code: 'kicad.pcb.geometry.saved-fill-invalid',
                construct: 'zone',
                sourceKey: sourceKey(zone),
                layer: zoneLayer(zone),
                message:
                    'KiCad PCB saved zone fill contains invalid polygon geometry.'
            })
        }

        const tinyArea = contours
            .map(polygonArea)
            .filter((area) => area > 0 && area < minimumSavedFillArea)
            .at(0)
        if (tinyArea !== undefined) {
            findings.push({
                severity: 'warning',
                code: 'kicad.pcb.geometry.saved-fill-tiny-island',
                construct: 'zone',
                sourceKey: sourceKey(zone),
                layer: zoneLayer(zone),
                islandArea: roundMetric(tinyArea),
                message:
                    'KiCad PCB saved zone fill contains a tiny polygon island.'
            })
        }
    }

    return findings
}

/**
 * Builds findings for saved B-Rep fill rings dropped during normalization.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function savedFillRingDroppedFindings(pcb) {
    const findings = []
    for (const zone of savedZoneRows(pcb)) {
        for (const diagnostic of brepShapeRingDiagnostics(zone)) {
            findings.push({
                severity: 'warning',
                code: 'kicad.pcb.geometry.saved-fill-ring-dropped',
                construct: 'zone',
                sourceKey: sourceKey(zone),
                layer: zoneLayer(zone),
                dropReason: diagnostic.reason,
                ringRole: diagnostic.role,
                shapeIndex: diagnostic.shapeIndex,
                ringIndex: diagnostic.ringIndex,
                pointCount: diagnostic.pointCount,
                ringArea: roundMetric(diagnostic.area),
                message:
                    'KiCad PCB saved zone fill contains a ring that was dropped during geometry cleanup.'
            })
        }
    }
    return findings
}

/**
 * Builds findings for text boxes.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function textBoxFindings(pcb) {
    return [...(pcb.drawings || []), ...(pcb.texts || [])]
        .filter(isTextBox)
        .map((textBox) => ({
            severity: 'info',
            code: 'kicad.pcb.geometry.text-box',
            construct: 'text-box',
            sourceKey: sourceKey(textBox),
            message:
                'KiCad PCB text box has fixed geometry that renderer consumers should preserve.'
        }))
}

/**
 * Builds findings for custom pads and their curve primitives.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function customPadFindings(pcb) {
    const findings = []
    for (const pad of pcb.pads || []) {
        if (String(pad?.shape || '') === 'custom') {
            findings.push({
                severity: 'warning',
                code: 'kicad.pcb.geometry.custom-pad',
                construct: 'pad',
                sourceKey: sourceKey(pad),
                message:
                    'KiCad PCB custom pad should be rendered from preserved primitive geometry.'
            })
        }
        for (const primitive of pad.customPrimitives || []) {
            if (String(primitive?.type || '') !== 'curve') continue
            findings.push({
                severity: 'info',
                code: 'kicad.pcb.geometry.custom-pad-curve',
                construct: 'curve',
                sourceKey: sourceKey(pad),
                message:
                    'KiCad PCB custom pad includes curve primitive control points.'
            })
        }
    }
    return findings
}

/**
 * Builds findings for missing or undersized footprint courtyards.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function courtyardFindings(pcb) {
    const findings = []
    for (const footprint of footprintRows(pcb)) {
        const pads = footprintPads(footprint, pcb)
        const padPoints = pads.flatMap(KicadPcbPadParser.pointsForPad)
        if (padPoints.length === 0) continue

        const courtyardDrawings = footprintDrawings(footprint, pcb).filter(
            isCourtyardDrawing
        )
        const padBounds = Geometry.boundsFromPoints(padPoints)
        if (courtyardDrawings.length === 0) {
            findings.push({
                severity: 'warning',
                code: 'kicad.pcb.geometry.footprint-missing-courtyard',
                construct: 'courtyard',
                sourceKey: sourceKey(footprint),
                padBounds: roundBounds(padBounds),
                message:
                    'KiCad PCB footprint has pad geometry but no courtyard drawing.'
            })
            continue
        }

        const courtyardBounds = Geometry.boundsFromPoints(
            courtyardDrawings.flatMap(KicadPcbDrawingParser.pointsForDrawing)
        )
        if (!boundsContain(courtyardBounds, padBounds)) {
            findings.push({
                severity: 'warning',
                code: 'kicad.pcb.geometry.footprint-courtyard-undercoverage',
                construct: 'courtyard',
                sourceKey: sourceKey(footprint),
                padBounds: roundBounds(padBounds),
                courtyardBounds: roundBounds(courtyardBounds),
                message:
                    'KiCad PCB footprint courtyard bounds do not cover all pad geometry.'
            })
        }
    }
    return findings
}

/**
 * Returns true when an arc has a stroke at least as thick as its radius.
 * @param {object} arc Arc row.
 * @returns {boolean}
 */
function isThickArc(arc) {
    const width = Number(arc?.width || 0)
    const radius = Number(arc?.radius || 0)
    return radius > 0 && width / 2 >= radius
}

/**
 * Returns true for text-box rows.
 * @param {object} value Candidate primitive.
 * @returns {boolean}
 */
function isTextBox(value) {
    return ['text_box', 'gr_text_box'].includes(
        String(value?.type || value?.sourceType || '')
    )
}

/**
 * Adds stable finding keys.
 * @param {object[]} findings Finding rows.
 * @returns {object[]}
 */
function keyedFindings(findings) {
    return findings.map((finding, index) => ({
        key: 'geometry-' + index,
        ...finding
    }))
}

/**
 * Builds summary counts.
 * @param {object} pcb PCB model.
 * @param {object[]} findings Finding rows.
 * @returns {object}
 */
function summary(pcb, findings) {
    return {
        findingCount: findings.length,
        warningCount: findings.filter((row) => row.severity === 'warning')
            .length,
        infoCount: findings.filter((row) => row.severity === 'info').length,
        thickArcCount: (pcb.arcs || []).filter(isThickArc).length,
        multiContourZoneCount: findings.filter((row) => {
            return row.code === 'kicad.pcb.geometry.multi-contour-zone'
        }).length,
        missingSavedZoneFillCount: findings.filter((row) => {
            return row.code === 'kicad.pcb.geometry.zone-fill-not-saved'
        }).length,
        invalidSavedFillCount: findings.filter((row) => {
            return row.code === 'kicad.pcb.geometry.saved-fill-invalid'
        }).length,
        tinySavedFillIslandCount: findings.filter((row) => {
            return row.code === 'kicad.pcb.geometry.saved-fill-tiny-island'
        }).length,
        droppedSavedFillRingCount: findings.filter((row) => {
            return row.code === 'kicad.pcb.geometry.saved-fill-ring-dropped'
        }).length,
        curvePrimitiveCount: findings.filter((row) => row.construct === 'curve')
            .length,
        textBoxCount: findings.filter((row) => row.construct === 'text-box')
            .length,
        customPadCount: (pcb.pads || []).filter((pad) => {
            return String(pad?.shape || '') === 'custom'
        }).length,
        missingCourtyardCount: findings.filter((row) => {
            return row.code === 'kicad.pcb.geometry.footprint-missing-courtyard'
        }).length,
        courtyardUndercoverageCount: findings.filter((row) => {
            return (
                row.code ===
                'kicad.pcb.geometry.footprint-courtyard-undercoverage'
            )
        }).length
    }
}

/**
 * Lists zone semantic rows from normalized and source board data.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function zoneSemanticRows(pcb) {
    return uniqueObjects([
        ...(pcb.zoneSemantics || []),
        ...(sourceBoard(pcb).zoneSemantics || [])
    ])
}

/**
 * Lists saved zone fill rows from normalized and source board data.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function savedZoneFillRows(pcb) {
    return savedZoneRows(pcb).filter(isSavedZoneFill)
}

/**
 * Lists saved zone candidate rows from normalized and source board data.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function savedZoneRows(pcb) {
    return uniqueObjects([
        ...(pcb.polygons || []),
        ...(pcb.drawings || []),
        ...(sourceBoard(pcb).polygons || []),
        ...(sourceBoard(pcb).drawings || [])
    ]).filter((row) => String(row?.type || row?.sourceType || '') === 'zone')
}

/**
 * Returns true when one zone semantic row needs saved fill geometry.
 * @param {object} zone Zone semantic row.
 * @returns {boolean}
 */
function isCopperZoneSemantic(zone) {
    return (
        KicadLayerResolver.metadataForLayer(zoneLayer(zone)).isCopper &&
        !isKeepoutZone(zone) &&
        Array.isArray(zone?.points) &&
        zone.points.length >= 3
    )
}

/**
 * Returns true when one zone row is a keepout.
 * @param {object} zone Zone row.
 * @returns {boolean}
 */
function isKeepoutZone(zone) {
    return (
        zone?.isKeepout === true ||
        String(zone?.kind || '') === 'keepout-zone' ||
        Object.values(zone?.keepoutTargets || {}).some(Boolean)
    )
}

/**
 * Returns true when one row contains saved zone fill geometry.
 * @param {object} row Candidate row.
 * @returns {boolean}
 */
function isSavedZoneFill(row) {
    return savedFillContours(row).some((contour) => pointCount(contour) >= 3)
}

/**
 * Lists polygon contours from supported saved fill representations.
 * @param {object} row Saved fill row.
 * @returns {object[][]}
 */
function savedFillContours(row) {
    return [
        pointList(row?.points),
        ...pointLists(row?.contours),
        ...pointLists(row?.segments),
        ...brepShapeContours(row)
    ].filter((contour) => contour.length > 0)
}

/**
 * Lists BREP outer and inner ring contours.
 * @param {object} row Saved fill row.
 * @returns {object[][]}
 */
function brepShapeContours(row) {
    return brepShapeRingReports(row)
        .filter((report) => !report.diagnostic)
        .map((report) => report.loop)
}

/**
 * Lists B-Rep ring diagnostics from supported saved fill representations.
 * @param {object} row Saved fill row.
 * @returns {object[]}
 */
function brepShapeRingDiagnostics(row) {
    return brepShapeRingReports(row)
        .map((report) => report.diagnostic)
        .filter(Boolean)
}

/**
 * Lists normalized B-Rep ring reports from supported saved fill representations.
 * @param {object} row Saved fill row.
 * @returns {{ loop: object[], diagnostic: object | null, area: number }[]}
 */
function brepShapeRingReports(row) {
    return brepShapes(row).flatMap((shape, shapeIndex) => {
        return [
            KicadSavedFillRingNormalizer.inspect(
                brepRingPoints(
                    shape?.outer_ring ||
                        shape?.outerRing ||
                        shape?.outer ||
                        shape?.outer_loop ||
                        shape?.outerLoop
                ),
                { role: 'outer', shapeIndex, ringIndex: 0 }
            ),
            ...array(
                shape?.inner_rings ||
                    shape?.innerRings ||
                    shape?.holes ||
                    shape?.inner ||
                    shape?.cutouts
            ).map((ring, ringIndex) =>
                KicadSavedFillRingNormalizer.inspect(brepRingPoints(ring), {
                    role: 'hole',
                    shapeIndex,
                    ringIndex
                })
            )
        ]
    })
}

/**
 * Lists saved-fill B-Rep shapes from supported row representations.
 * @param {object} row Saved fill row.
 * @returns {object[]}
 */
function brepShapes(row) {
    return [
        ...optionalObject(row?.brep_shape),
        ...optionalObject(row?.brepShape),
        ...array(row?.brep_shapes),
        ...array(row?.brepShapes),
        ...array(row?.brep_shape_array),
        ...array(row?.brepShapeArray)
    ]
}

/**
 * Normalizes one optional object into a list.
 * @param {unknown} value Candidate object.
 * @returns {object[]}
 */
function optionalObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? [value]
        : []
}

/**
 * Normalizes a value to an array.
 * @param {unknown} value Candidate value.
 * @returns {any[]}
 */
function array(value) {
    return Array.isArray(value) ? value : []
}

/**
 * Normalizes B-Rep ring arrays to point contours.
 * @param {unknown} value Candidate ring list.
 * @returns {object[][]}
 */
function brepRingPoints(ring) {
    const points = Array.isArray(ring)
        ? ring
        : ring?.vertices ||
          ring?.cwVertices ||
          ring?.cw_vertices ||
          ring?.points
    return array(points)
}

/**
 * Normalizes a list of contour-like values.
 * @param {unknown} value Candidate contour list.
 * @returns {object[][]}
 */
function pointLists(value) {
    if (!Array.isArray(value)) return []

    return value.map(pointList)
}

/**
 * Normalizes one contour-like value to points.
 * @param {unknown} value Candidate contour.
 * @returns {object[]}
 */
function pointList(value) {
    if (Array.isArray(value?.vertices)) return pointList(value.vertices)
    if (Array.isArray(value?.cwVertices)) return pointList(value.cwVertices)
    if (Array.isArray(value?.cw_vertices)) return pointList(value.cw_vertices)
    if (Array.isArray(value?.points)) return pointList(value.points)
    if (!Array.isArray(value)) return []
    if (value.every(isPointLike)) return value
    if (value.every(isSegmentLike)) return pointsFromSegments(value)

    return []
}

/**
 * Returns points from segment-like rows.
 * @param {object[]} segments Segment rows.
 * @returns {object[]}
 */
function pointsFromSegments(segments) {
    return segments.flatMap((segment) => [
        { x: segment.x1, y: segment.y1 },
        { x: segment.x2, y: segment.y2 }
    ])
}

/**
 * Checks whether a semantic zone has a matching saved fill row.
 * @param {object} zone Zone semantic row.
 * @param {object[]} savedZoneFills Saved zone fills.
 * @returns {boolean}
 */
function hasSavedZoneFill(zone, savedZoneFills) {
    const zoneIndex = optionalInteger(zone?.zoneIndex)
    if (zoneIndex !== null) {
        return savedZoneFills.some((fill) => {
            return zoneIndexFromFill(fill) === zoneIndex
        })
    }

    return savedZoneFills.some((fill) => {
        return (
            sameText(zoneLayer(zone), zoneLayer(fill)) &&
            sameText(netName(zone), netName(fill))
        )
    })
}

/**
 * Resolves a zone index from a saved fill row.
 * @param {object} fill Saved zone fill row.
 * @returns {number | null}
 */
function zoneIndexFromFill(fill) {
    const direct = optionalInteger(fill?.zoneIndex)
    if (direct !== null) return direct

    const match = /(?:^|:)zone:(\d+)(?::|$)/u.exec(
        String(fill?.id || fill?.key || '')
    )
    return match ? Number(match[1]) : null
}

/**
 * Builds a stable semantic zone source key.
 * @param {object} zone Zone semantic row.
 * @param {number} fallbackIndex Fallback index.
 * @returns {string}
 */
function semanticZoneSourceKey(zone, fallbackIndex) {
    const zoneIndex = optionalInteger(zone?.zoneIndex)
    return sourceKey(zone) || 'zone-' + (zoneIndex ?? fallbackIndex)
}

/**
 * Resolves a normalized zone layer name.
 * @param {object} zone Zone row.
 * @returns {string}
 */
function zoneLayer(zone) {
    return String(zone?.layerKey || zone?.layer || zone?.layerName || '')
}

/**
 * Resolves a normalized net name.
 * @param {object} row Candidate row.
 * @returns {string}
 */
function netName(row) {
    return String(row?.netName || row?.net || '')
}

/**
 * Counts points in one candidate geometry list.
 * @param {unknown} value Candidate point or segment list.
 * @returns {number}
 */
function pointCount(value) {
    return Array.isArray(value) ? value.length : 0
}

/**
 * Returns true when a value exposes finite point coordinates.
 * @param {unknown} value Candidate point.
 * @returns {boolean}
 */
function isPointLike(value) {
    return (
        Number.isFinite(Number(value?.x)) && Number.isFinite(Number(value?.y))
    )
}

/**
 * Returns true when a value exposes finite segment coordinates.
 * @param {unknown} value Candidate segment.
 * @returns {boolean}
 */
function isSegmentLike(value) {
    return (
        Number.isFinite(Number(value?.x1)) &&
        Number.isFinite(Number(value?.y1)) &&
        Number.isFinite(Number(value?.x2)) &&
        Number.isFinite(Number(value?.y2))
    )
}

/**
 * Calculates absolute polygon area.
 * @param {object[]} points Polygon points.
 * @returns {number}
 */
function polygonArea(points) {
    const openPoints = removeClosingPoint(points)
    let area = 0

    for (let index = 0; index < openPoints.length; index += 1) {
        const current = openPoints[index]
        const next = openPoints[(index + 1) % openPoints.length]
        area += Number(current.x) * Number(next.y)
        area -= Number(next.x) * Number(current.y)
    }

    return Math.abs(area / 2)
}

/**
 * Removes a repeated closing point from a polygon.
 * @param {object[]} points Polygon points.
 * @returns {object[]}
 */
function removeClosingPoint(points) {
    if (points.length < 2) return points
    const first = points[0]
    const last = points.at(-1)

    return Number(first.x) === Number(last.x) &&
        Number(first.y) === Number(last.y)
        ? points.slice(0, -1)
        : points
}

/**
 * Parses an optional integer.
 * @param {unknown} value Candidate value.
 * @returns {number | null}
 */
function optionalInteger(value) {
    const number = Number(value)
    return Number.isInteger(number) ? number : null
}

/**
 * Compares two optional strings after trimming.
 * @param {unknown} left Left value.
 * @param {unknown} right Right value.
 * @returns {boolean}
 */
function sameText(left, right) {
    return String(left || '').trim() === String(right || '').trim()
}

/**
 * Resolves the raw board object from normalized wrappers.
 * @param {object} pcb Candidate PCB object.
 * @returns {object}
 */
function sourceBoard(pcb) {
    return pcb?.kicadBoard || pcb?.pcb?.kicadBoard || pcb?.pcb || {}
}

/**
 * Lists footprint rows from a PCB model.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function footprintRows(pcb) {
    return uniqueObjects([
        ...(pcb.footprints || []),
        ...(sourceBoard(pcb).footprints || [])
    ])
}

/**
 * Lists pads belonging to one footprint.
 * @param {object} footprint Footprint row.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function footprintPads(footprint, pcb) {
    const footprintId = sourceKey(footprint)
    return uniqueObjects([
        ...(footprint.pads || []),
        ...(pcb.pads || []).filter((pad) =>
            belongsToFootprint(pad, footprintId)
        ),
        ...(sourceBoard(pcb).pads || []).filter((pad) =>
            belongsToFootprint(pad, footprintId)
        )
    ])
}

/**
 * Lists drawings belonging to one footprint.
 * @param {object} footprint Footprint row.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function footprintDrawings(footprint, pcb) {
    const footprintId = sourceKey(footprint)
    return uniqueObjects([
        ...(footprint.drawings || []),
        ...(pcb.drawings || []).filter((drawing) =>
            belongsToFootprint(drawing, footprintId)
        ),
        ...(sourceBoard(pcb).drawings || []).filter((drawing) =>
            belongsToFootprint(drawing, footprintId)
        )
    ])
}

/**
 * Returns true when a primitive belongs to a footprint id.
 * @param {object} primitive Primitive row.
 * @param {string} footprintId Footprint id.
 * @returns {boolean}
 */
function belongsToFootprint(primitive, footprintId) {
    return [primitive?.footprintId, primitive?.ownerId, primitive?.ownerIndex]
        .map(String)
        .includes(footprintId)
}

/**
 * Returns true when a drawing is on a courtyard layer.
 * @param {object} drawing Drawing row.
 * @returns {boolean}
 */
function isCourtyardDrawing(drawing) {
    const layer = String(drawing?.layer || drawing?.layerKey || '')
    return KicadLayerResolver.metadataForLayer(layer).layerClass === 'courtyard'
}

/**
 * Returns true when outer bounds contain inner bounds.
 * @param {object} outer Outer bounds.
 * @param {object} inner Inner bounds.
 * @returns {boolean}
 */
function boundsContain(outer, inner) {
    return (
        outer.minX <= inner.minX + boundsTolerance &&
        outer.minY <= inner.minY + boundsTolerance &&
        outer.maxX >= inner.maxX - boundsTolerance &&
        outer.maxY >= inner.maxY - boundsTolerance
    )
}

/**
 * Rounds bounds for deterministic report output.
 * @param {object} bounds Bounds.
 * @returns {object}
 */
function roundBounds(bounds) {
    return {
        minX: roundMetric(bounds.minX),
        minY: roundMetric(bounds.minY),
        maxX: roundMetric(bounds.maxX),
        maxY: roundMetric(bounds.maxY),
        width: roundMetric(bounds.width),
        height: roundMetric(bounds.height)
    }
}

/**
 * Returns a stable source key for a construct.
 * @param {object} value Construct row.
 * @returns {string}
 */
function sourceKey(value) {
    return String(value?.id || value?.key || value?.name || '')
}

/**
 * Groups finding keys by one field.
 * @param {object[]} rows Finding rows.
 * @param {string} field Field name.
 * @returns {Record<string, string[]>}
 */
function keysBy(rows, field) {
    const groups = {}
    for (const row of rows) {
        const key = String(row[field] || '')
        if (!key) continue
        groups[key] ||= []
        groups[key].push(row.key)
    }
    return Object.fromEntries(Object.entries(groups).sort())
}

/**
 * Deduplicates object references while preserving order.
 * @param {object[]} values Candidate rows.
 * @returns {object[]}
 */
function uniqueObjects(values) {
    return values.filter((value, index, all) => all.indexOf(value) === index)
}

/**
 * Rounds report metrics to stable precision.
 * @param {unknown} value Numeric value.
 * @returns {number}
 */
function roundMetric(value) {
    const number = Number(value)
    if (!Number.isFinite(number)) return 0
    return Math.round(number * 1000) / 1000
}
