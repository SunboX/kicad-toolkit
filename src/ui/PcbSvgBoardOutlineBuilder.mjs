// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { Geometry } from '../core/kicad/Geometry.mjs'
import { KicadArcGeometry } from '../core/kicad/KicadArcGeometry.mjs'

const pointEpsilon = 0.01

/**
 * Builds closed SVG board paths from KiCad Edge.Cuts primitives.
 */
export class PcbSvgBoardOutlineBuilder {
    /**
     * Builds the primary closed board path from line and arc Edge.Cuts.
     * @param {object[]} outlines Board outline primitives.
     * @returns {{ d: string, strokeWidth: number } | null}
     */
    static build(outlines) {
        const segments = PcbSvgBoardOutlineBuilder.#outlineSegments(outlines)
        if (segments.length === 0) return null

        const chain = PcbSvgBoardOutlineBuilder.#connectSegments(segments)
        if (!chain || chain.segments.length < 2) return null
        if (!PcbSvgBoardOutlineBuilder.#samePoint(chain.start, chain.end)) {
            return null
        }

        return {
            d:
                chain.segments
                    .map((segment, index) =>
                        PcbSvgBoardOutlineBuilder.#pathCommand(segment, index)
                    )
                    .join(' ') + ' Z',
            strokeWidth: Math.max(
                0.08,
                ...chain.segments.map(
                    (segment) => Number(segment.strokeWidth) || 0.08
                )
            )
        }
    }

    /**
     * Normalizes supported outline primitives.
     * @param {object[]} outlines Board outline primitives.
     * @returns {object[]}
     */
    static #outlineSegments(outlines) {
        return (Array.isArray(outlines) ? outlines : [])
            .map((outline) =>
                PcbSvgBoardOutlineBuilder.#normalizeSegment(outline)
            )
            .filter(Boolean)
    }

    /**
     * Normalizes one outline primitive into start/end form.
     * @param {object} outline Outline primitive.
     * @returns {object | null}
     */
    static #normalizeSegment(outline) {
        if (outline?.type === 'line' && outline.start && outline.end) {
            return { ...outline }
        }

        if (
            outline?.type === 'arc' &&
            outline.start &&
            outline.mid &&
            outline.end
        ) {
            return { ...outline }
        }

        return null
    }

    /**
     * Connects unordered outline segments into one path chain.
     * @param {object[]} segments Outline segments.
     * @returns {{ start: object, end: object, segments: object[] } | null}
     */
    static #connectSegments(segments) {
        const [first, ...rest] = segments
        const chain = {
            start: first.start,
            end: first.end,
            segments: [first]
        }
        const unused = [...rest]

        while (unused.length > 0) {
            const match = PcbSvgBoardOutlineBuilder.#takeNextSegment(
                unused,
                chain.end
            )
            if (!match) return null
            chain.segments.push(match)
            chain.end = match.end
        }

        return chain
    }

    /**
     * Finds and removes the next connected segment.
     * @param {object[]} unused Remaining segments.
     * @param {object} end Current end point.
     * @returns {object | null}
     */
    static #takeNextSegment(unused, end) {
        const index = unused.findIndex((segment) => {
            return (
                PcbSvgBoardOutlineBuilder.#samePoint(segment.start, end) ||
                PcbSvgBoardOutlineBuilder.#samePoint(segment.end, end)
            )
        })
        if (index < 0) return null

        const [segment] = unused.splice(index, 1)
        if (PcbSvgBoardOutlineBuilder.#samePoint(segment.start, end)) {
            return segment
        }

        return PcbSvgBoardOutlineBuilder.#reverseSegment(segment)
    }

    /**
     * Reverses one line or arc segment.
     * @param {object} segment Outline segment.
     * @returns {object}
     */
    static #reverseSegment(segment) {
        return {
            ...segment,
            start: segment.end,
            end: segment.start
        }
    }

    /**
     * Renders one SVG path command.
     * @param {object} segment Outline segment.
     * @param {number} index Segment index.
     * @returns {string}
     */
    static #pathCommand(segment, index) {
        const prefix =
            index === 0
                ? `M ${formatNumber(segment.start.x)} ${formatNumber(segment.start.y)} `
                : ''

        if (segment.type === 'arc') {
            return prefix + PcbSvgBoardOutlineBuilder.#arcCommand(segment)
        }

        return (
            prefix +
            `L ${formatNumber(segment.end.x)} ${formatNumber(segment.end.y)}`
        )
    }

    /**
     * Renders one SVG arc command.
     * @param {object} segment Arc segment.
     * @returns {string}
     */
    static #arcCommand(segment) {
        const arc = KicadArcGeometry.fromThreePoints(
            segment.start,
            segment.mid,
            segment.end
        )
        if (!arc) {
            return `Q ${formatNumber(segment.mid.x)} ${formatNumber(segment.mid.y)} ${formatNumber(segment.end.x)} ${formatNumber(segment.end.y)}`
        }

        return [
            'A',
            formatNumber(arc.radius),
            formatNumber(arc.radius),
            '0',
            arc.largeArc ? '1' : '0',
            arc.sweep ? '1' : '0',
            formatNumber(segment.end.x),
            formatNumber(segment.end.y)
        ].join(' ')
    }

    /**
     * Checks whether two points are close enough to join.
     * @param {object} first First point.
     * @param {object} second Second point.
     * @returns {boolean}
     */
    static #samePoint(first, second) {
        return Geometry.distance(first, second) <= pointEpsilon
    }
}

/**
 * Formats a number for compact SVG output.
 * @param {number} value Number.
 * @returns {string}
 */
function formatNumber(value) {
    return Number(value || 0)
        .toFixed(4)
        .replace(/\.?0+$/u, '')
}
