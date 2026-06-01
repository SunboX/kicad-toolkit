// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Small geometry helpers for KiCad millimeter coordinates.
 */
export class Geometry {
    /**
     * Rotates a local point by degrees around origin.
     * @param {{ x: number, y: number }} point
     * @param {number} degrees
     * @returns {{ x: number, y: number }}
     */
    static rotatePoint(point, degrees) {
        const radians = (Number(degrees) || 0) * (Math.PI / 180)
        const cos = Math.cos(radians)
        const sin = Math.sin(radians)
        return {
            x: point.x * cos - point.y * sin,
            y: point.x * sin + point.y * cos
        }
    }

    /**
     * Applies a KiCad footprint transform to a local point.
     * @param {{ x: number, y: number }} point
     * @param {{ x: number, y: number, rotation: number }} transform
     * @returns {{ x: number, y: number }}
     */
    static transformPoint(point, transform) {
        const rotated = Geometry.rotatePoint(point, transform.rotation)
        return {
            x: transform.x + rotated.x,
            y: transform.y + rotated.y
        }
    }

    /**
     * Returns the four corners of a rotated rectangle.
     * @param {{ x: number, y: number, width: number, height: number, rotation?: number }} rectangle Rectangle.
     * @returns {{ x: number, y: number }[]}
     */
    static rotatedRectanglePoints(rectangle) {
        const center = {
            x: Number(rectangle?.x) || 0,
            y: Number(rectangle?.y) || 0
        }
        const halfWidth = Math.max(0, Number(rectangle?.width) || 0) / 2
        const halfHeight = Math.max(0, Number(rectangle?.height) || 0) / 2
        return [
            { x: -halfWidth, y: -halfHeight },
            { x: halfWidth, y: -halfHeight },
            { x: halfWidth, y: halfHeight },
            { x: -halfWidth, y: halfHeight }
        ].map((point) => {
            const rotated = Geometry.rotatePoint(
                point,
                Number(rectangle?.rotation) || 0
            )
            return {
                x: center.x + rotated.x,
                y: center.y + rotated.y
            }
        })
    }

    /**
     * Returns Euclidean distance.
     * @param {{ x: number, y: number }} first
     * @param {{ x: number, y: number }} second
     * @returns {number}
     */
    static distance(first, second) {
        return Math.hypot(first.x - second.x, first.y - second.y)
    }

    /**
     * Builds a circular geometry descriptor.
     * @param {{ x: number, y: number }} center Center point.
     * @param {number} radius Radius.
     * @returns {{ kind: 'circle', center: { x: number, y: number }, radius: number }}
     */
    static circleGeometry(center, radius) {
        return {
            kind: 'circle',
            center: pointValue(center),
            radius: Math.max(0, Number(radius) || 0)
        }
    }

    /**
     * Builds a stroked segment geometry descriptor.
     * @param {{ x: number, y: number }} start Start point.
     * @param {{ x: number, y: number }} end End point.
     * @param {number} [radius] Stroke radius.
     * @returns {{ kind: 'segment', start: { x: number, y: number }, end: { x: number, y: number }, radius: number }}
     */
    static segmentGeometry(start, end, radius = 0) {
        return {
            kind: 'segment',
            start: pointValue(start),
            end: pointValue(end),
            radius: Math.max(0, Number(radius) || 0)
        }
    }

    /**
     * Builds a polygon geometry descriptor.
     * @param {{ x: number, y: number }[]} points Polygon points.
     * @returns {{ kind: 'polygon', points: { x: number, y: number }[] }}
     */
    static polygonGeometry(points) {
        return {
            kind: 'polygon',
            points: (Array.isArray(points) ? points : []).map(pointValue)
        }
    }

    /**
     * Returns points that bound a geometry descriptor.
     * @param {object | null | undefined} geometry Geometry descriptor.
     * @returns {{ x: number, y: number }[]}
     */
    static pointsForGeometryBounds(geometry) {
        if (!geometry || typeof geometry !== 'object') return []
        if (geometry.kind === 'circle') {
            const center = pointValue(geometry.center)
            const radius = Math.max(0, Number(geometry.radius) || 0)
            return [
                { x: center.x - radius, y: center.y - radius },
                { x: center.x + radius, y: center.y + radius }
            ]
        }
        if (geometry.kind === 'segment') {
            const start = pointValue(geometry.start)
            const end = pointValue(geometry.end)
            const radius = Math.max(0, Number(geometry.radius) || 0)
            return [
                {
                    x: Math.min(start.x, end.x) - radius,
                    y: Math.min(start.y, end.y) - radius
                },
                {
                    x: Math.max(start.x, end.x) + radius,
                    y: Math.max(start.y, end.y) + radius
                }
            ]
        }
        if (geometry.kind === 'polygon') {
            return (Array.isArray(geometry.points) ? geometry.points : []).map(
                pointValue
            )
        }
        return []
    }

    /**
     * Returns bounds for a geometry descriptor.
     * @param {object | null | undefined} geometry Geometry descriptor.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }}
     */
    static boundsFromGeometry(geometry) {
        return Geometry.boundsFromPoints(
            Geometry.pointsForGeometryBounds(geometry)
        )
    }

    /**
     * Computes analytic edge clearance between supported geometry descriptors.
     * @param {object} first First geometry.
     * @param {object} second Second geometry.
     * @returns {{ clearance: number | null, method: 'analytic' | 'bbox' | 'unknown' }}
     */
    static clearanceBetweenGeometries(first, second) {
        const analytic = analyticClearance(first, second)
        if (analytic !== null) {
            return {
                clearance: roundMetric(Math.max(0, analytic)),
                method: 'analytic'
            }
        }

        const firstPoints = Geometry.pointsForGeometryBounds(first)
        const secondPoints = Geometry.pointsForGeometryBounds(second)
        if (firstPoints.length > 0 && secondPoints.length > 0) {
            return {
                clearance: roundMetric(
                    boundsDistance(
                        Geometry.boundsFromPoints(firstPoints),
                        Geometry.boundsFromPoints(secondPoints)
                    )
                ),
                method: 'bbox'
            }
        }

        return {
            clearance: null,
            method: 'unknown'
        }
    }

    /**
     * Creates bounds from points.
     * @param {{ x: number, y: number }[]} points
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }}
     */
    static boundsFromPoints(points) {
        const finitePoints = points.filter((point) => {
            return Number.isFinite(point.x) && Number.isFinite(point.y)
        })

        if (finitePoints.length === 0) {
            return {
                minX: 0,
                minY: 0,
                maxX: 1,
                maxY: 1,
                width: 1,
                height: 1
            }
        }

        const xs = finitePoints.map((point) => point.x)
        const ys = finitePoints.map((point) => point.y)
        const minX = Math.min(...xs)
        const minY = Math.min(...ys)
        const maxX = Math.max(...xs)
        const maxY = Math.max(...ys)

        return {
            minX,
            minY,
            maxX,
            maxY,
            width: Math.max(0.001, maxX - minX),
            height: Math.max(0.001, maxY - minY)
        }
    }

    /**
     * Adds padding to bounds.
     * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
     * @param {number} padding
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }}
     */
    static expandBounds(bounds, padding) {
        const amount = Number(padding) || 0
        return {
            minX: bounds.minX - amount,
            minY: bounds.minY - amount,
            maxX: bounds.maxX + amount,
            maxY: bounds.maxY + amount,
            width: bounds.maxX - bounds.minX + amount * 2,
            height: bounds.maxY - bounds.minY + amount * 2
        }
    }

    /**
     * Returns the center of bounds.
     * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
     * @returns {{ x: number, y: number }}
     */
    static boundsCenter(bounds) {
        return {
            x: (bounds.minX + bounds.maxX) / 2,
            y: (bounds.minY + bounds.maxY) / 2
        }
    }
}

/**
 * Normalizes a point-like value.
 * @param {object | undefined} point Point-like value.
 * @returns {{ x: number, y: number }}
 */
function pointValue(point) {
    return {
        x: Number(point?.x) || 0,
        y: Number(point?.y) || 0
    }
}

/**
 * Rounds geometry metrics to stable micrometer-level precision.
 * @param {number} value Metric value.
 * @returns {number}
 */
function roundMetric(value) {
    return Number((Number(value) || 0).toFixed(6))
}

/**
 * Computes analytic clearance where geometry types are supported.
 * @param {object} first First geometry.
 * @param {object} second Second geometry.
 * @returns {number | null}
 */
function analyticClearance(first, second) {
    const firstKind = String(first?.kind || '')
    const secondKind = String(second?.kind || '')
    const firstSegment = segmentLike(first)
    const secondSegment = segmentLike(second)

    if (firstSegment && secondSegment) {
        return (
            segmentToSegmentDistance(
                firstSegment.start,
                firstSegment.end,
                secondSegment.start,
                secondSegment.end
            ) -
            firstSegment.radius -
            secondSegment.radius
        )
    }

    if (firstKind === 'polygon' && secondKind === 'polygon') {
        return polygonToPolygonDistance(first.points || [], second.points || [])
    }

    if (firstSegment && secondKind === 'polygon') {
        return (
            segmentToPolygonDistance(
                firstSegment.start,
                firstSegment.end,
                second.points || []
            ) - firstSegment.radius
        )
    }

    if (firstKind === 'polygon' && secondSegment) {
        return analyticClearance(second, first)
    }

    return null
}

/**
 * Converts circle and segment descriptors to segment geometry.
 * @param {object} geometry Geometry descriptor.
 * @returns {{ start: { x: number, y: number }, end: { x: number, y: number }, radius: number } | null}
 */
function segmentLike(geometry) {
    if (geometry?.kind === 'circle') {
        const center = pointValue(geometry.center)
        return {
            start: center,
            end: center,
            radius: Math.max(0, Number(geometry.radius) || 0)
        }
    }
    if (geometry?.kind === 'segment') {
        return {
            start: pointValue(geometry.start),
            end: pointValue(geometry.end),
            radius: Math.max(0, Number(geometry.radius) || 0)
        }
    }
    return null
}

/**
 * Computes shortest distance from a point to a segment.
 * @param {{ x: number, y: number }} point Point.
 * @param {{ x: number, y: number }} start Segment start.
 * @param {{ x: number, y: number }} end Segment end.
 * @returns {number}
 */
function pointToSegmentDistance(point, start, end) {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSquared = dx * dx + dy * dy
    if (lengthSquared === 0) return Geometry.distance(point, start)

    const t = Math.max(
        0,
        Math.min(
            1,
            ((point.x - start.x) * dx + (point.y - start.y) * dy) /
                lengthSquared
        )
    )
    return Geometry.distance(point, {
        x: start.x + t * dx,
        y: start.y + t * dy
    })
}

/**
 * Computes shortest distance between two line segments.
 * @param {{ x: number, y: number }} firstStart First start.
 * @param {{ x: number, y: number }} firstEnd First end.
 * @param {{ x: number, y: number }} secondStart Second start.
 * @param {{ x: number, y: number }} secondEnd Second end.
 * @returns {number}
 */
function segmentToSegmentDistance(
    firstStart,
    firstEnd,
    secondStart,
    secondEnd
) {
    if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) {
        return 0
    }

    return Math.min(
        pointToSegmentDistance(firstStart, secondStart, secondEnd),
        pointToSegmentDistance(firstEnd, secondStart, secondEnd),
        pointToSegmentDistance(secondStart, firstStart, firstEnd),
        pointToSegmentDistance(secondEnd, firstStart, firstEnd)
    )
}

/**
 * Returns whether two line segments intersect.
 * @param {{ x: number, y: number }} firstStart First start.
 * @param {{ x: number, y: number }} firstEnd First end.
 * @param {{ x: number, y: number }} secondStart Second start.
 * @param {{ x: number, y: number }} secondEnd Second end.
 * @returns {boolean}
 */
function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
    const d1 = direction(firstStart, firstEnd, secondStart)
    const d2 = direction(firstStart, firstEnd, secondEnd)
    const d3 = direction(secondStart, secondEnd, firstStart)
    const d4 = direction(secondStart, secondEnd, firstEnd)

    return (
        ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    )
}

/**
 * Returns segment orientation for a point.
 * @param {{ x: number, y: number }} start Segment start.
 * @param {{ x: number, y: number }} end Segment end.
 * @param {{ x: number, y: number }} point Point.
 * @returns {number}
 */
function direction(start, end, point) {
    return (
        (point.x - start.x) * (end.y - start.y) -
        (point.y - start.y) * (end.x - start.x)
    )
}

/**
 * Computes shortest distance from a point to a polygon.
 * @param {{ x: number, y: number }} point Point.
 * @param {{ x: number, y: number }[]} polygon Polygon.
 * @returns {number}
 */
function pointToPolygonDistance(point, polygon) {
    const points = polygon.map(pointValue)
    if (points.length === 0) return 0
    if (pointInPolygon(point, points)) return 0
    return Math.min(
        ...polygonEdges(points).map(([start, end]) =>
            pointToSegmentDistance(point, start, end)
        )
    )
}

/**
 * Computes shortest distance from a segment to a polygon.
 * @param {{ x: number, y: number }} start Segment start.
 * @param {{ x: number, y: number }} end Segment end.
 * @param {{ x: number, y: number }[]} polygon Polygon.
 * @returns {number}
 */
function segmentToPolygonDistance(start, end, polygon) {
    const points = polygon.map(pointValue)
    if (points.length === 0) return 0
    if (pointInPolygon(start, points) || pointInPolygon(end, points)) return 0
    if (
        polygonEdges(points).some((edge) =>
            segmentsIntersect(start, end, ...edge)
        )
    ) {
        return 0
    }
    return Math.min(
        pointToPolygonDistance(start, points),
        pointToPolygonDistance(end, points),
        ...points.map((point) => pointToSegmentDistance(point, start, end))
    )
}

/**
 * Computes shortest distance between two polygons.
 * @param {{ x: number, y: number }[]} first First polygon.
 * @param {{ x: number, y: number }[]} second Second polygon.
 * @returns {number}
 */
function polygonToPolygonDistance(first, second) {
    const firstPoints = first.map(pointValue)
    const secondPoints = second.map(pointValue)
    if (firstPoints.length === 0 || secondPoints.length === 0) return 0
    if (
        firstPoints.some((point) => pointInPolygon(point, secondPoints)) ||
        secondPoints.some((point) => pointInPolygon(point, firstPoints))
    ) {
        return 0
    }
    for (const firstEdge of polygonEdges(firstPoints)) {
        for (const secondEdge of polygonEdges(secondPoints)) {
            if (segmentsIntersect(...firstEdge, ...secondEdge)) return 0
        }
    }
    return Math.min(
        ...firstPoints.map((point) =>
            pointToPolygonDistance(point, secondPoints)
        ),
        ...secondPoints.map((point) =>
            pointToPolygonDistance(point, firstPoints)
        )
    )
}

/**
 * Returns polygon edge pairs.
 * @param {{ x: number, y: number }[]} points Polygon points.
 * @returns {[{ x: number, y: number }, { x: number, y: number }][]}
 */
function polygonEdges(points) {
    if (points.length < 2) return []
    return points.map((point, index) => [
        point,
        points[(index + 1) % points.length]
    ])
}

/**
 * Returns whether a point lies inside a polygon.
 * @param {{ x: number, y: number }} point Point.
 * @param {{ x: number, y: number }[]} polygon Polygon.
 * @returns {boolean}
 */
function pointInPolygon(point, polygon) {
    let inside = false
    for (
        let index = 0, previous = polygon.length - 1;
        index < polygon.length;
        previous = index++
    ) {
        const current = polygon[index]
        const before = polygon[previous]
        const intersects =
            current.y > point.y !== before.y > point.y &&
            point.x <
                ((before.x - current.x) * (point.y - current.y)) /
                    (before.y - current.y || Number.EPSILON) +
                    current.x
        if (intersects) inside = !inside
    }
    return inside
}

/**
 * Computes distance between two axis-aligned bounds.
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} first First bounds.
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} second Second bounds.
 * @returns {number}
 */
function boundsDistance(first, second) {
    const dx = Math.max(0, first.minX - second.maxX, second.minX - first.maxX)
    const dy = Math.max(0, first.minY - second.maxY, second.minY - first.maxY)
    return Math.hypot(dx, dy)
}
