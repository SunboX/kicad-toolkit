// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { SchematicSvgUtils } from './SchematicSvgUtils.mjs'

const { escapeHtml, formatNumber } = SchematicSvgUtils

/**
 * Computes schematic content clipping for KiCad-native pages.
 */
export class SchematicContentLayout {
    /**
     * Builds one deterministic clip-path identifier for one schematic SVG.
     * @param {number} width SVG width.
     * @param {number} height SVG height.
     * @param {{ sheet?: { marginWidth?: number }, lines?: unknown[], texts?: unknown[], components?: unknown[], pins?: unknown[], regions?: unknown[] }} schematic Schematic model.
     * @returns {string}
     */
    static buildClipId(width, height, schematic = {}) {
        return [
            'schematic-content-clip',
            Math.round(Number(width || 0)),
            Math.round(Number(height || 0)),
            Math.round(Number(schematic.sheet?.marginWidth || 20)),
            (schematic.lines || []).length,
            (schematic.texts || []).length,
            (schematic.components || []).length,
            (schematic.pins || []).length,
            (schematic.regions || []).length
        ].join('-')
    }

    /**
     * Builds a clip path that confines primitives to the KiCad sheet frame.
     * @param {number} width SVG width.
     * @param {number} height SVG height.
     * @param {{ sheet?: { marginWidth?: number } }} schematic Schematic model.
     * @param {string} clipId Clip path id.
     * @returns {string}
     */
    static buildClipMarkup(width, height, schematic = {}, clipId = '') {
        const margin = Math.max(Number(schematic.sheet?.marginWidth || 20), 10)

        return (
            '<defs><clipPath id="' +
            escapeHtml(clipId) +
            '"><rect x="' +
            formatNumber(margin) +
            '" y="' +
            formatNumber(margin) +
            '" width="' +
            formatNumber(Math.max(Number(width || 0) - margin * 2, 10)) +
            '" height="' +
            formatNumber(Math.max(Number(height || 0) - margin * 2, 10)) +
            '" /></clipPath></defs>'
        )
    }

    /**
     * Builds a content transform. KiCad parser output is already normalized.
     * @returns {string}
     */
    static buildTransform() {
        return ''
    }
}
