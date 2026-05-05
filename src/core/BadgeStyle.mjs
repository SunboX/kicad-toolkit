// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { RenderPalette } from './RenderPalette.mjs'

const defaultBadgeStyle = {
    foregroundColor: '#000000',
    scale: 1,
    shadowColor: '#000000',
    shadowOpacity: 0,
    shadowBlur: 0.8,
    shadowOffsetX: 0.6,
    shadowOffsetY: 0.6
}

/**
 * Normalizes configurable badge rendering style.
 */
export class BadgeStyle {
    /**
     * Returns the default badge style.
     * @returns {{ foregroundColor: string, scale: number, shadowColor: string, shadowOpacity: number, shadowBlur: number, shadowOffsetX: number, shadowOffsetY: number }}
     */
    static defaultStyle() {
        return { ...defaultBadgeStyle }
    }

    /**
     * Normalizes a partial badge style patch.
     * @param {unknown} value
     * @param {{ foregroundColor: string, scale: number, shadowColor: string, shadowOpacity: number, shadowBlur: number, shadowOffsetX: number, shadowOffsetY: number }} [base]
     * @returns {{ foregroundColor: string, scale: number, shadowColor: string, shadowOpacity: number, shadowBlur: number, shadowOffsetX: number, shadowOffsetY: number }}
     */
    static normalize(value, base = defaultBadgeStyle) {
        const style =
            value && typeof value === 'object'
                ? /** @type {Record<string, unknown>} */ (value)
                : {}
        return {
            foregroundColor: RenderPalette.normalizeColor(
                style.foregroundColor,
                base.foregroundColor
            ),
            scale: clampNumber(style.scale, base.scale, 0.5, 2),
            shadowColor: RenderPalette.normalizeColor(
                style.shadowColor,
                base.shadowColor
            ),
            shadowOpacity: clampNumber(
                style.shadowOpacity,
                base.shadowOpacity,
                0,
                1
            ),
            shadowBlur: clampNumber(style.shadowBlur, base.shadowBlur, 0, 5),
            shadowOffsetX: clampNumber(
                style.shadowOffsetX,
                base.shadowOffsetX,
                -5,
                5
            ),
            shadowOffsetY: clampNumber(
                style.shadowOffsetY,
                base.shadowOffsetY,
                -5,
                5
            )
        }
    }
}

/**
 * Clamps a finite numeric style value.
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampNumber(value, fallback, min, max) {
    const number = Number(value)
    if (!Number.isFinite(number)) return fallback
    return Math.max(min, Math.min(max, number))
}
