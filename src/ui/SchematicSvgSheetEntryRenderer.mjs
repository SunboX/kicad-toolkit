// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const defaultMarkerLength = 2.2
const defaultTextGap = 0.55
const defaultTextSize = 1.27

/**
 * Renders hierarchical sheet entry markers and labels.
 */
export class SchematicSvgSheetEntryRenderer {
    /**
     * Renders all hierarchical sheet entries.
     * @param {object[]} entries Sheet entry rows.
     * @param {{ color: string, renderStrokeText: Function }} options Callbacks.
     * @returns {string}
     */
    static renderEntries(entries, options) {
        const rendered = (entries || [])
            .map((entry) => renderEntry(entry, options))
            .join('')
        if (!rendered) return ''
        return `<g class="schematic-sheet-entries">${rendered}</g>`
    }
}

/**
 * Renders one sheet entry row.
 * @param {object} entry Sheet entry row.
 * @param {{ color: string, renderStrokeText: Function }} options Callbacks.
 * @returns {string}
 */
function renderEntry(entry, options) {
    const side = sideToken(entry?.side)
    const kind = classToken(entry?.kind || 'passive')
    const marker = markerGeometry(entry, side)
    const text = textAnchor(marker, side)
    const label = String(entry?.name || '')
    const parts = [
        `<path class="schematic-sheet-entry-marker" d="${marker.path}" fill="none" stroke="${options.color}" stroke-width="0.15" stroke-linecap="round"/>`
    ]

    if (label) {
        parts.push(
            options.renderStrokeText({
                className: 'schematic-sheet-entry-text',
                x: text.x,
                y: text.y,
                value: label,
                color: options.color,
                sizeX: textSize(entry, 'width'),
                sizeY: textSize(entry, 'height'),
                hAlign: text.hAlign,
                vAlign: text.vAlign,
                rotation: 0
            })
        )
    }

    return `<g class="schematic-sheet-entry schematic-sheet-entry--${side} schematic-sheet-entry--${kind}">${parts.join('')}</g>`
}

/**
 * Resolves marker geometry for one sheet entry.
 * @param {object} entry Sheet entry row.
 * @param {string} side Sheet side token.
 * @returns {{ path: string, x: number, y: number }}
 */
function markerGeometry(entry, side) {
    const x = Number(entry?.x || 0)
    const y = Number(entry?.y || 0)
    const length = defaultMarkerLength

    if (side === 'right') {
        return {
            x,
            y,
            path: `M ${formatNumber(x - length)} ${formatNumber(y)} L ${formatNumber(x)} ${formatNumber(y)}`
        }
    }
    if (side === 'top') {
        return {
            x,
            y,
            path: `M ${formatNumber(x)} ${formatNumber(y)} L ${formatNumber(x)} ${formatNumber(y + length)}`
        }
    }
    if (side === 'bottom') {
        return {
            x,
            y,
            path: `M ${formatNumber(x)} ${formatNumber(y - length)} L ${formatNumber(x)} ${formatNumber(y)}`
        }
    }

    return {
        x,
        y,
        path: `M ${formatNumber(x)} ${formatNumber(y)} L ${formatNumber(x + length)} ${formatNumber(y)}`
    }
}

/**
 * Resolves label anchor geometry for one sheet entry marker.
 * @param {{ x: number, y: number }} marker Marker anchor.
 * @param {string} side Sheet side token.
 * @returns {{ x: number, y: number, hAlign: string, vAlign: string }}
 */
function textAnchor(marker, side) {
    const offset = defaultMarkerLength + defaultTextGap

    if (side === 'right') {
        return {
            x: marker.x - offset,
            y: marker.y,
            hAlign: 'right',
            vAlign: 'center'
        }
    }
    if (side === 'top') {
        return {
            x: marker.x,
            y: marker.y + offset,
            hAlign: 'center',
            vAlign: 'top'
        }
    }
    if (side === 'bottom') {
        return {
            x: marker.x,
            y: marker.y - offset,
            hAlign: 'center',
            vAlign: 'bottom'
        }
    }

    return {
        x: marker.x + offset,
        y: marker.y,
        hAlign: 'left',
        vAlign: 'center'
    }
}

/**
 * Resolves a sheet entry side token.
 * @param {unknown} side Candidate side.
 * @returns {'left' | 'right' | 'top' | 'bottom'}
 */
function sideToken(side) {
    if (side === 'right' || side === 'top' || side === 'bottom') return side
    return 'left'
}

/**
 * Resolves a CSS class token.
 * @param {unknown} value Candidate value.
 * @returns {string}
 */
function classToken(value) {
    const token = String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/gu, '-')
        .replace(/^-+|-+$/gu, '')
    return token || 'passive'
}

/**
 * Resolves a positive sheet entry text size.
 * @param {object} entry Sheet entry row.
 * @param {'width' | 'height'} field Font field.
 * @returns {number}
 */
function textSize(entry, field) {
    const value =
        Number(entry?.font?.[field]) ||
        Number(entry?.fontSize) ||
        Number(entry?.size) ||
        defaultTextSize
    return Math.max(value, 0.001)
}

/**
 * Formats a number.
 * @param {number | undefined} value Number.
 * @returns {string}
 */
function formatNumber(value) {
    return Number(value || 0)
        .toFixed(3)
        .replace(/\.?0+$/u, '')
}
