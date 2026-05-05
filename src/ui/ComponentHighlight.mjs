// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { RenderPalette } from '../core/RenderPalette.mjs'

/**
 * Resolves component highlight colors and footprint states.
 */
export class ComponentHighlight {
    /**
     * Resolves component highlight renderer settings.
     * @param {{ highlightedFootprints?: readonly string[], hoveredFootprintId?: string, highlightColor?: string }} options
     * @returns {{ selected: Set<string>, hovered: string, color: string, hoverColor: string }}
     */
    static resolve(options) {
        const color = RenderPalette.normalizeColor(
            options.highlightColor,
            '#ff3b2b'
        )
        return {
            selected: new Set(
                (options.highlightedFootprints || [])
                    .map((id) => String(id || '').trim())
                    .filter(Boolean)
            ),
            hovered: String(options.hoveredFootprintId || '').trim(),
            color,
            hoverColor: ComponentHighlight.#mixHexColor(color, '#cfd1d4', 0.55)
        }
    }

    /**
     * Resolves the highlight state for a footprint-owned SVG primitive.
     * @param {unknown} ownerId
     * @param {{ selected: Set<string>, hovered: string, color: string, hoverColor: string }} highlight
     * @returns {{ state: 'selected' | 'hover', color: string } | null}
     */
    static stateFor(ownerId, highlight) {
        const id = String(ownerId || '').trim()
        if (!id || id === 'board') return null
        if (highlight.selected.has(id)) {
            return { state: 'selected', color: highlight.color }
        }
        if (highlight.hovered === id) {
            return { state: 'hover', color: highlight.hoverColor }
        }
        return null
    }

    /**
     * Mixes two six-digit hex colors.
     * @param {string} color
     * @param {string} otherColor
     * @param {number} otherAmount
     * @returns {string}
     */
    static #mixHexColor(color, otherColor, otherAmount) {
        const first = ComponentHighlight.#hexToRgb(color)
        const second = ComponentHighlight.#hexToRgb(otherColor)
        const amount = Math.max(0, Math.min(1, Number(otherAmount) || 0))
        const ownAmount = 1 - amount

        return ComponentHighlight.#rgbToHex({
            r: Math.round(first.r * ownAmount + second.r * amount),
            g: Math.round(first.g * ownAmount + second.g * amount),
            b: Math.round(first.b * ownAmount + second.b * amount)
        })
    }

    /**
     * Parses a normalized hex color.
     * @param {string} color
     * @returns {{ r: number, g: number, b: number }}
     */
    static #hexToRgb(color) {
        const normalized = RenderPalette.normalizeColor(color, '#000000')
        return {
            r: Number.parseInt(normalized.slice(1, 3), 16),
            g: Number.parseInt(normalized.slice(3, 5), 16),
            b: Number.parseInt(normalized.slice(5, 7), 16)
        }
    }

    /**
     * Formats RGB channels as a hex color.
     * @param {{ r: number, g: number, b: number }} color
     * @returns {string}
     */
    static #rgbToHex(color) {
        return (
            '#' +
            [color.r, color.g, color.b]
                .map((channel) =>
                    Math.max(0, Math.min(255, channel))
                        .toString(16)
                        .padStart(2, '0')
                )
                .join('')
        )
    }
}
