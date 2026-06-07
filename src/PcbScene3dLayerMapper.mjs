// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { PcbScene3dTextBoxLayoutResolver } from './PcbScene3dTextBoxLayoutResolver.mjs'

/**
 * Maps board-space layer primitives into KiCad's 3D layer coordinate space.
 */
export class PcbScene3dLayerMapper {
    /**
     * Maps board outline segments into KiCad's Y-up 3D layer space.
     * @param {object[]} segments Board outline segments.
     * @param {{ centerY: number }} board Board placement metadata in mils.
     * @returns {object[]}
     */
    static boardSegments(segments, board) {
        return (segments || []).map((segment) =>
            PcbScene3dLayerMapper.segment(segment, board)
        )
    }

    /**
     * Maps one routed segment-like primitive into KiCad's Y-up 3D layer space.
     * @param {object} segment Segment in board coordinates.
     * @param {{ centerY: number }} board Board placement metadata in mils.
     * @returns {object}
     */
    static segment(segment, board) {
        return PcbScene3dLayerMapper.#mapYFields(segment, board, [
            'y',
            'y1',
            'y2',
            'cy'
        ])
    }

    /**
     * Maps one copper track into KiCad's Y-up 3D layer space.
     * @param {object} track Copper track in board coordinates.
     * @param {{ centerY: number }} board Board placement metadata in mils.
     * @returns {object}
     */
    static track(track, board) {
        return PcbScene3dLayerMapper.segment(track, board)
    }

    /**
     * Maps one pad into KiCad's Y-up 3D layer space.
     * @param {object} pad Pad in board coordinates.
     * @param {{ centerY: number }} board Board placement metadata in mils.
     * @returns {object}
     */
    static pad(pad, board) {
        return PcbScene3dLayerMapper.#mapLocalYOffsets(
            {
                ...PcbScene3dLayerMapper.#mapYFields(pad, board, ['y']),
                rotation: PcbScene3dLayerMapper.#negateRotation(pad?.rotation),
                holeRotation: PcbScene3dLayerMapper.#negateOptionalRotation(
                    pad?.holeRotation
                )
            },
            ['offsetTopY', 'offsetMidY', 'offsetBottomY']
        )
    }

    /**
     * Maps one via into KiCad's Y-up 3D layer space.
     * @param {object} via Via in board coordinates.
     * @param {{ centerY: number }} board Board placement metadata in mils.
     * @returns {object}
     */
    static via(via, board) {
        return PcbScene3dLayerMapper.#mapYFields(via, board, ['y'])
    }

    /**
     * Maps one copper or silkscreen arc into KiCad's Y-up 3D layer space.
     * @param {object} arc Arc in board coordinates.
     * @param {{ centerY: number }} board Board placement metadata in mils.
     * @returns {object}
     */
    static arc(arc, board) {
        return {
            ...PcbScene3dLayerMapper.#mapYFields(arc, board, ['y']),
            startAngle: -Number(arc?.startAngle || 0),
            endAngle: -Number(arc?.endAngle || 0)
        }
    }

    /**
     * Maps one fill primitive into KiCad's Y-up 3D layer space.
     * @param {object} fill Fill in board coordinates.
     * @param {{ centerY: number }} board Board placement metadata in mils.
     * @returns {object}
     */
    static fill(fill, board) {
        if (Array.isArray(fill?.points)) {
            return {
                ...fill,
                points: PcbScene3dLayerMapper.points(fill.points, board)
            }
        }

        const mapped = PcbScene3dLayerMapper.#mapYFields(fill, board, [
            'y',
            'y1',
            'y2',
            'cy'
        ])

        if (
            PcbScene3dLayerMapper.#hasOwn(fill, 'y1') &&
            PcbScene3dLayerMapper.#hasOwn(fill, 'y2')
        ) {
            return {
                ...mapped,
                y1: Math.min(mapped.y1, mapped.y2),
                y2: Math.max(mapped.y1, mapped.y2)
            }
        }

        return mapped
    }

    /**
     * Maps one polygon or zone primitive into KiCad's Y-up 3D layer space.
     * @param {object} polygon Polygon in board coordinates.
     * @param {{ centerY: number }} board Board placement metadata in mils.
     * @returns {object}
     */
    static polygon(polygon, board) {
        return {
            ...PcbScene3dLayerMapper.fill(polygon, board),
            segments: Array.isArray(polygon?.segments)
                ? PcbScene3dLayerMapper.boardSegments(polygon.segments, board)
                : polygon?.segments
        }
    }

    /**
     * Maps one text anchor into KiCad's Y-up 3D layer space.
     * @param {object} text Text primitive in board coordinates.
     * @param {{ centerY: number }} board Board placement metadata in mils.
     * @returns {object}
     */
    static text(text, board) {
        const textBoxLayout = PcbScene3dTextBoxLayoutResolver.resolve(text)
        const mapped = {
            ...PcbScene3dLayerMapper.#mapYFields(text, board, ['y']),
            rotation: PcbScene3dLayerMapper.#negateRotation(text?.rotation)
        }

        return textBoxLayout ? { ...mapped, textBoxLayout } : mapped
    }

    /**
     * Maps one point into KiCad's Y-up 3D layer space.
     * @param {{ x?: number, y?: number }} point Point in board coordinates.
     * @param {{ centerY: number }} board Board placement metadata in mils.
     * @returns {{ x?: number, y?: number }}
     */
    static point(point, board) {
        return PcbScene3dLayerMapper.#mapYFields(point, board, ['y'])
    }

    /**
     * Maps a point list into KiCad's Y-up 3D layer space.
     * @param {{ x?: number, y?: number }[]} points Points in board coordinates.
     * @param {{ centerY: number }} board Board placement metadata in mils.
     * @returns {{ x?: number, y?: number }[]}
     */
    static points(points, board) {
        return (points || []).map((point) =>
            PcbScene3dLayerMapper.point(point, board)
        )
    }

    /**
     * Maps one silkscreen track into KiCad's Y-up 3D layer space.
     * @param {object} track Silkscreen track in board coordinates.
     * @param {{ centerY: number }} board Board placement metadata in mils.
     * @returns {object}
     */
    static silkscreenTrack(track, board) {
        return PcbScene3dLayerMapper.track(track, board)
    }

    /**
     * Maps one silkscreen arc into KiCad's Y-up 3D layer space.
     * @param {object} arc Silkscreen arc in board coordinates.
     * @param {{ centerY: number }} board Board placement metadata in mils.
     * @returns {object}
     */
    static silkscreenArc(arc, board) {
        return PcbScene3dLayerMapper.arc(arc, board)
    }

    /**
     * Maps one silkscreen fill into KiCad's Y-up 3D layer space.
     * @param {object} fill Silkscreen fill in board coordinates.
     * @param {{ centerY: number }} board Board placement metadata in mils.
     * @returns {object}
     */
    static silkscreenFill(fill, board) {
        return PcbScene3dLayerMapper.fill(fill, board)
    }

    /**
     * Mirrors a board-space Y coordinate around the board center for 3D layers.
     * @param {number | string | undefined} value Board-space Y value in mils.
     * @param {{ centerY: number }} board Board placement metadata in mils.
     * @returns {number}
     */
    static boardY(value, board) {
        return Number(board?.centerY || 0) * 2 - Number(value || 0)
    }

    /**
     * Maps selected Y fields on a primitive.
     * @param {object | undefined} primitive Source primitive.
     * @param {{ centerY: number }} board Board placement metadata in mils.
     * @param {string[]} fields Y field names.
     * @returns {object}
     */
    static #mapYFields(primitive, board, fields) {
        const mapped = { ...(primitive || {}) }

        fields.forEach((field) => {
            if (PcbScene3dLayerMapper.#hasOwn(primitive, field)) {
                mapped[field] = PcbScene3dLayerMapper.boardY(
                    primitive[field],
                    board
                )
            }
        })

        return mapped
    }

    /**
     * Negates local Y offsets after the scene coordinate handedness changes.
     * @param {object} primitive Source primitive.
     * @param {string[]} fields Offset field names.
     * @returns {object}
     */
    static #mapLocalYOffsets(primitive, fields) {
        const mapped = { ...primitive }

        fields.forEach((field) => {
            if (PcbScene3dLayerMapper.#hasOwn(primitive, field)) {
                mapped[field] = -Number(primitive[field] || 0)
            }
        })

        return mapped
    }

    /**
     * Negates and normalizes a present rotation value.
     * @param {number | string | undefined} rotation Rotation in degrees.
     * @returns {number}
     */
    static #negateRotation(rotation) {
        return PcbScene3dLayerMapper.#normalizeRotation(-Number(rotation || 0))
    }

    /**
     * Negates one optional rotation while preserving null-ish values.
     * @param {number | string | null | undefined} rotation Rotation in degrees.
     * @returns {number | null | undefined}
     */
    static #negateOptionalRotation(rotation) {
        if (rotation === null || rotation === undefined) {
            return rotation
        }

        return PcbScene3dLayerMapper.#negateRotation(rotation)
    }

    /**
     * Normalizes one rotation into KiCad's positive degree range.
     * @param {number} rotation Rotation in degrees.
     * @returns {number}
     */
    static #normalizeRotation(rotation) {
        const value = Number(rotation) || 0
        return ((value % 360) + 360) % 360
    }

    /**
     * Checks whether an object owns one property.
     * @param {object | undefined} value Source object.
     * @param {string} field Field name.
     * @returns {boolean}
     */
    static #hasOwn(value, field) {
        return Object.prototype.hasOwnProperty.call(value || {}, field)
    }
}
