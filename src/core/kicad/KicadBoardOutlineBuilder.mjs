// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadArcGeometry } from './KicadArcGeometry.mjs'

/**
 * Builds renderer-compatible board outline data from parsed KiCad outlines.
 */
export class KicadBoardOutlineBuilder {
    /**
     * Builds a normalized board outline.
     * @param {object} board KiCad board.
     * @param {(value: number) => number} toMil Unit converter.
     * @returns {object}
     */
    static build(board, toMil) {
        const contours = KicadBoardOutlineBuilder.#outlineContours(
            board.outlines || []
        )
        const points = contours[0]?.points?.length
            ? contours[0].points
            : KicadBoardOutlineBuilder.#boundsPoints(board.bounds)
        const bounds = board.bounds || {
            minX: 0,
            minY: 0,
            width: 1,
            height: 1
        }

        return {
            widthMil: toMil(bounds.width),
            heightMil: toMil(bounds.height),
            minX: toMil(bounds.minX),
            minY: toMil(bounds.minY),
            segments: KicadBoardOutlineBuilder.segmentsFromPoints(
                points,
                toMil
            ),
            cutouts: contours.slice(1).map((contour) => ({
                points: contour.points.map((point) =>
                    KicadBoardOutlineBuilder.#toMilPoint(point, toMil)
                )
            }))
        }
    }

    /**
     * Builds mil segments from KiCad points.
     * @param {{ x: number, y: number }[]} points Points.
     * @param {(value: number) => number} toMil Unit converter.
     * @returns {object[]}
     */
    static segmentsFromPoints(points, toMil) {
        const segments = []
        const contourPoints =
            KicadBoardOutlineBuilder.#removeClosingPoint(points)
        for (let index = 0; index < contourPoints.length; index += 1) {
            const start = contourPoints[index]
            const end = contourPoints[(index + 1) % contourPoints.length]
            if (!start || !end) continue
            segments.push({
                type: 'line',
                x1: toMil(start.x),
                y1: toMil(start.y),
                x2: toMil(end.x),
                y2: toMil(end.y)
            })
        }
        return segments
    }

    /**
     * Builds ordered outline contours from Edge.Cuts primitives.
     * @param {object[]} outlines Outline primitives.
     * @returns {{ points: { x: number, y: number }[], area: number }[]}
     */
    static #outlineContours(outlines) {
        const directContours = []
        const lineSegments = []

        for (const outline of outlines || []) {
            const directContour =
                KicadBoardOutlineBuilder.#directContour(outline)
            if (directContour) {
                directContours.push(directContour)
                continue
            }

            const segment = KicadBoardOutlineBuilder.#outlineSegment(outline)
            if (segment) {
                lineSegments.push(segment)
            }
        }

        return [
            ...directContours,
            ...KicadBoardOutlineBuilder.#lineContours(lineSegments)
        ]
            .filter((contour) => contour.points.length >= 4)
            .map((contour) => ({
                ...contour,
                area: Math.abs(
                    KicadBoardOutlineBuilder.#polygonArea(contour.points)
                )
            }))
            .sort((first, second) => second.area - first.area)
    }

    /**
     * Builds closed contours from unordered line segments.
     * @param {{ start: object, end: object }[]} segments Line segments.
     * @returns {{ points: { x: number, y: number }[] }[]}
     */
    static #lineContours(segments) {
        const remaining = [...segments]
        const contours = []

        while (remaining.length) {
            const current = remaining.shift()
            const points = current.points.map(
                KicadBoardOutlineBuilder.#pointObject
            )

            while (
                !KicadBoardOutlineBuilder.#pointsMatch(
                    points[points.length - 1],
                    points[0]
                )
            ) {
                const matchIndex = remaining.findIndex((segment) => {
                    return (
                        KicadBoardOutlineBuilder.#pointsMatch(
                            segment.start,
                            points[points.length - 1]
                        ) ||
                        KicadBoardOutlineBuilder.#pointsMatch(
                            segment.end,
                            points[points.length - 1]
                        )
                    )
                })
                if (matchIndex < 0) break

                const [match] = remaining.splice(matchIndex, 1)
                const nextPoints = KicadBoardOutlineBuilder.#pointsMatch(
                    match.start,
                    points[points.length - 1]
                )
                    ? match.points.slice(1)
                    : [...match.points].reverse().slice(1)
                points.push(
                    ...nextPoints.map(KicadBoardOutlineBuilder.#pointObject)
                )
            }

            contours.push(KicadBoardOutlineBuilder.#closedContour(points))
        }

        return contours
    }

    /**
     * Returns a closed contour for self-contained outline primitives.
     * @param {object} outline Outline primitive.
     * @returns {{ points: { x: number, y: number }[] } | null}
     */
    static #directContour(outline) {
        if (
            outline?.type !== 'curve' &&
            Array.isArray(outline?.points) &&
            outline.points.length >= 3
        ) {
            return KicadBoardOutlineBuilder.#closedContour(outline.points)
        }

        if (outline?.type === 'circle' && outline.center) {
            return KicadBoardOutlineBuilder.#closedContour(
                KicadBoardOutlineBuilder.#circlePoints(outline)
            )
        }

        return null
    }

    /**
     * Returns a segment for outline primitives that must be stitched.
     * @param {object} outline Outline primitive.
     * @returns {{ start: object, end: object, points: object[] } | null}
     */
    static #outlineSegment(outline) {
        if (outline?.type === 'line' && outline.start && outline.end) {
            return KicadBoardOutlineBuilder.#segmentFromPoints([
                outline.start,
                outline.end
            ])
        }

        if (
            outline?.type === 'arc' &&
            outline.start &&
            outline.mid &&
            outline.end
        ) {
            return KicadBoardOutlineBuilder.#segmentFromPoints(
                KicadArcGeometry.toPolyline(
                    outline.start,
                    outline.mid,
                    outline.end,
                    { maxSegmentDegrees: 10 }
                )
            )
        }

        if (outline?.type === 'curve' && Array.isArray(outline.points)) {
            return KicadBoardOutlineBuilder.#segmentFromPoints(outline.points)
        }

        return null
    }

    /**
     * Builds a segment from a polyline point list.
     * @param {object[]} points Polyline points.
     * @returns {{ start: object, end: object, points: object[] } | null}
     */
    static #segmentFromPoints(points) {
        const normalized = (points || []).map(
            KicadBoardOutlineBuilder.#pointObject
        )
        if (normalized.length < 2) return null

        return {
            start: normalized[0],
            end: normalized[normalized.length - 1],
            points: normalized
        }
    }

    /**
     * Samples a circle as a deterministic closed contour.
     * @param {object} outline Circle primitive.
     * @returns {{ x: number, y: number }[]}
     */
    static #circlePoints(outline) {
        const center = KicadBoardOutlineBuilder.#pointObject(outline.center)
        const radius = Number(outline.radius || 0)
        const segments = 32

        return Array.from({ length: segments }, (_, index) => {
            const angle = (Math.PI * 2 * index) / segments
            return {
                x: center.x + Math.cos(angle) * radius,
                y: center.y + Math.sin(angle) * radius
            }
        })
    }

    /**
     * Returns a closed contour point list.
     * @param {object[]} points Points.
     * @returns {{ points: { x: number, y: number }[] }}
     */
    static #closedContour(points) {
        const normalized = (points || []).map(
            KicadBoardOutlineBuilder.#pointObject
        )
        const openPoints =
            KicadBoardOutlineBuilder.#removeClosingPoint(normalized)
        if (!openPoints.length) return { points: [] }
        return {
            points: [
                ...openPoints,
                KicadBoardOutlineBuilder.#pointObject(openPoints[0])
            ]
        }
    }

    /**
     * Drops a duplicated closing point from a contour.
     * @param {object[]} points Points.
     * @returns {object[]}
     */
    static #removeClosingPoint(points) {
        if (points.length < 2) return points
        const first = points[0]
        const last = points[points.length - 1]
        return KicadBoardOutlineBuilder.#pointsMatch(first, last)
            ? points.slice(0, -1)
            : points
    }

    /**
     * Returns true when two board-space points match.
     * @param {object} first First point.
     * @param {object} second Second point.
     * @returns {boolean}
     */
    static #pointsMatch(first, second) {
        return (
            Math.abs(Number(first?.x || 0) - Number(second?.x || 0)) < 1e-6 &&
            Math.abs(Number(first?.y || 0) - Number(second?.y || 0)) < 1e-6
        )
    }

    /**
     * Builds a numeric point object.
     * @param {object} point Source point.
     * @returns {{ x: number, y: number }}
     */
    static #pointObject(point) {
        return {
            x: Number(point?.x || 0),
            y: Number(point?.y || 0)
        }
    }

    /**
     * Converts a board-space millimeter point to mils.
     * @param {object} point Source point.
     * @param {(value: number) => number} toMil Unit converter.
     * @returns {{ x: number, y: number }}
     */
    static #toMilPoint(point, toMil) {
        return {
            x: toMil(point?.x || 0),
            y: toMil(point?.y || 0)
        }
    }

    /**
     * Calculates signed polygon area.
     * @param {{ x: number, y: number }[]} points Points.
     * @returns {number}
     */
    static #polygonArea(points) {
        const openPoints = KicadBoardOutlineBuilder.#removeClosingPoint(points)
        let area = 0
        for (let index = 0; index < openPoints.length; index += 1) {
            const current = openPoints[index]
            const next = openPoints[(index + 1) % openPoints.length]
            area += current.x * next.y - next.x * current.y
        }
        return area / 2
    }

    /**
     * Returns rectangle points from bounds.
     * @param {object} bounds Bounds.
     * @returns {{ x: number, y: number }[]}
     */
    static #boundsPoints(bounds) {
        const minX = Number(bounds?.minX || 0)
        const minY = Number(bounds?.minY || 0)
        const maxX = Number(bounds?.maxX || minX + 1)
        const maxY = Number(bounds?.maxY || minY + 1)
        return [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY }
        ]
    }
}
