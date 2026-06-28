// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

const PAPER_SIZES = new Map([
    ['A4', { width: 297, height: 210 }],
    ['A3', { width: 420, height: 297 }],
    ['A2', { width: 594, height: 420 }],
    ['A1', { width: 841, height: 594 }],
    ['A0', { width: 1189, height: 841 }]
])

/**
 * Maps source schematic coordinates into KiCad schematic coordinates.
 */
export class CircuitJsonKicadProjectSchematicTransform {
    #scale
    #offsetX
    #offsetY

    /**
     * Creates a schematic transform.
     * @param {{ scale?: number, offsetX?: number, offsetY?: number }} [options] Transform options.
     */
    constructor(options = {}) {
        this.#scale = CircuitJsonKicadProjectSchematicTransform.validScale(
            options.scale
        )
        this.#offsetX = Utils.number(options.offsetX, 0)
        this.#offsetY = Utils.number(options.offsetY, 0)
    }

    /**
     * Builds a transform from export context and selected paper.
     * @param {object} context Export context.
     * @param {{ paperName?: string, sourceBounds?: object | null, centerOnPage?: boolean }} [options] Transform options.
     * @returns {CircuitJsonKicadProjectSchematicTransform}
     */
    static fromContext(context, options = {}) {
        const scale =
            CircuitJsonKicadProjectSchematicTransform.scaleFromContext(context)
        const sourceBounds = options.sourceBounds || null
        const centerOnPage =
            options.centerOnPage ?? context?.schematicCenterOnPage
        if (!centerOnPage || !sourceBounds) {
            return new CircuitJsonKicadProjectSchematicTransform({ scale })
        }

        const center =
            CircuitJsonKicadProjectSchematicTransform.boundsCenter(sourceBounds)
        const paper = CircuitJsonKicadProjectSchematicTransform.paperSize(
            options.paperName
        )

        return new CircuitJsonKicadProjectSchematicTransform({
            scale,
            offsetX: paper.width / 2 - center.x * scale,
            offsetY: -paper.height / 2 - center.y * scale
        })
    }

    /**
     * Returns an identity transform.
     * @returns {CircuitJsonKicadProjectSchematicTransform}
     */
    static identity() {
        return new CircuitJsonKicadProjectSchematicTransform()
    }

    /**
     * Resolves a transform from context.
     * @param {object} context Export context.
     * @returns {CircuitJsonKicadProjectSchematicTransform}
     */
    static forContext(context) {
        return (
            context?.schematicTransform ||
            CircuitJsonKicadProjectSchematicTransform.identity()
        )
    }

    /**
     * Resolves the schematic scale factor from context.
     * @param {object} context Export context.
     * @returns {number}
     */
    static scaleFromContext(context) {
        return CircuitJsonKicadProjectSchematicTransform.validScale(
            context?.schematicScaleFactor
        )
    }

    /**
     * Resolves a positive finite scale factor.
     * @param {unknown} value Candidate scale.
     * @returns {number}
     */
    static validScale(value) {
        const scale = Utils.number(value, 1)
        return scale > 0 ? scale : 1
    }

    /**
     * Returns paper dimensions by KiCad paper name.
     * @param {unknown} name Candidate paper name.
     * @returns {{ width: number, height: number }}
     */
    static paperSize(name) {
        return (
            PAPER_SIZES.get(Utils.text(name, 'A4').toUpperCase()) ||
            PAPER_SIZES.get('A4')
        )
    }

    /**
     * Computes the center of source bounds.
     * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds Source bounds.
     * @returns {{ x: number, y: number }}
     */
    static boundsCenter(bounds) {
        return {
            x: Utils.round((bounds.minX + bounds.maxX) / 2),
            y: Utils.round((bounds.minY + bounds.maxY) / 2)
        }
    }

    /**
     * Applies only the scale factor to source bounds.
     * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds Source bounds.
     * @param {number} scale Scale factor.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
     */
    static scaledBounds(bounds, scale) {
        return {
            minX: Utils.round(bounds.minX * scale),
            minY: Utils.round(bounds.minY * scale),
            maxX: Utils.round(bounds.maxX * scale),
            maxY: Utils.round(bounds.maxY * scale)
        }
    }

    /**
     * Maps a source schematic point into transformed source-space coordinates.
     * @param {{ x: number, y: number }} point Source point.
     * @returns {{ x: number, y: number }}
     */
    point(point) {
        return {
            x: Utils.round(point.x * this.#scale + this.#offsetX),
            y: Utils.round(point.y * this.#scale + this.#offsetY)
        }
    }

    /**
     * Maps a source point to KiCad page coordinates.
     * @param {{ x: number, y: number }} point Source point.
     * @returns {{ x: number, y: number }}
     */
    pagePoint(point) {
        const mapped = this.point(point)
        return {
            x: mapped.x,
            y: Utils.round(-mapped.y)
        }
    }

    /**
     * Maps a source point into symbol-local KiCad coordinates.
     * @param {{ x: number, y: number }} center Source symbol center.
     * @param {{ x: number, y: number }} point Source point.
     * @returns {{ x: number, y: number }}
     */
    localPoint(center, point) {
        return {
            x: Utils.round((point.x - center.x) * this.#scale),
            y: Utils.round(-(point.y - center.y) * this.#scale)
        }
    }

    /**
     * Scales a source length.
     * @param {unknown} value Candidate length.
     * @param {number} [fallback] Fallback length.
     * @returns {number}
     */
    length(value, fallback = 0) {
        return Utils.round(Utils.number(value, fallback) * this.#scale)
    }

    /**
     * Maps source bounds into transformed source-space bounds.
     * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds Source bounds.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
     */
    bounds(bounds) {
        const first = this.point({ x: bounds.minX, y: bounds.minY })
        const second = this.point({ x: bounds.maxX, y: bounds.maxY })
        return {
            minX: Math.min(first.x, second.x),
            minY: Math.min(first.y, second.y),
            maxX: Math.max(first.x, second.x),
            maxY: Math.max(first.y, second.y)
        }
    }
}
