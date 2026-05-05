// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { BadgeStyle } from '../core/BadgeStyle.mjs'
import { RenderPalette } from '../core/RenderPalette.mjs'

const badgeRadius = 2.2
const badgeDiameter = badgeRadius * 2
const badgePillHorizontalPadding = 2.4
const badgePillCharacterWidth = 1.05

/**
 * Renders movable assembly badges into SVG.
 */
export class BadgeRenderer {
    /**
     * Renders all badges visible on the selected side.
     * @param {readonly object[]} badges
     * @param {'front' | 'back'} side
     * @param {string} color
     * @param {object} [style]
     * @returns {string}
     */
    static render(badges = [], side = 'front', color = '#ff3b2b', style = {}) {
        const fill = RenderPalette.normalizeColor(color, '#ff3b2b')
        const badgeStyle = BadgeStyle.normalize(style)
        const visibleBadges = badges.filter((badge) => badge.side === side)
        return [
            renderShadowDefinition(badgeStyle, visibleBadges.length > 0),
            ...visibleBadges.map((badge) =>
                BadgeRenderer.#renderOne(badge, fill, side, badgeStyle)
            )
        ].join('')
    }

    /**
     * Renders one badge.
     * @param {{ id: string, text: string, x: number, y: number, rotation?: number }} badge
     * @param {string} fill
     * @param {'front' | 'back'} side
     * @param {{ foregroundColor: string, scale: number, shadowOpacity: number }} style
     * @returns {string}
     */
    static #renderOne(badge, fill, side, style) {
        const text = String(badge.text || '')
        return [
            `<g class="pcb-badge" data-badge-id="${escapeAttribute(badge.id)}" transform="${badgeTransform(badge, style.scale)}">`,
            renderBadgeShape(text, fill, style),
            `<text class="pcb-badge-text"${badgeTextTransform(side)} y="${formatNumber(badgeTextOffset(text))}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${formatNumber(badgeFontSize(text))}" font-weight="700" fill="${style.foregroundColor}">${escapeText(text)}</text>`,
            '</g>'
        ].join('')
    }
}

/**
 * Renders the badge shape, using a circle for short labels and a pill for longer text.
 * @param {string} text
 * @param {string} fill
 * @param {{ foregroundColor: string, shadowOpacity: number }} style
 * @returns {string}
 */
function renderBadgeShape(text, fill, style) {
    const common = `fill="${fill}" stroke="${style.foregroundColor}" stroke-width="0.12"${shadowFilterAttribute(style)}`
    if (!isPillBadge(text)) {
        return `<circle class="pcb-badge-fill" r="${formatNumber(badgeRadius)}" ${common}/>`
    }

    const width = pillBadgeWidth(text)
    return `<rect class="pcb-badge-fill" x="${formatNumber(-width / 2)}" y="${formatNumber(-badgeRadius)}" width="${formatNumber(width)}" height="${formatNumber(badgeDiameter)}" rx="${formatNumber(badgeRadius)}" ry="${formatNumber(badgeRadius)}" ${common}/>`
}

/**
 * Checks whether a badge needs the wider pill shape.
 * @param {string} text
 * @returns {boolean}
 */
function isPillBadge(text) {
    return text.length > 2
}

/**
 * Resolves the pill width for longer badge labels.
 * @param {string} text
 * @returns {number}
 */
function pillBadgeWidth(text) {
    return Math.max(
        badgeDiameter,
        text.length * badgePillCharacterWidth + badgePillHorizontalPadding
    )
}

/**
 * Renders the optional badge shadow filter.
 * @param {{ shadowColor: string, shadowOpacity: number, shadowBlur: number, shadowOffsetX: number, shadowOffsetY: number }} style
 * @param {boolean} hasBadges
 * @returns {string}
 */
function renderShadowDefinition(style, hasBadges) {
    if (!hasBadges || style.shadowOpacity <= 0) return ''

    return [
        '<defs>',
        '<filter id="pcb-badge-shadow" x="-50%" y="-50%" width="200%" height="200%">',
        `<feDropShadow dx="${formatNumber(style.shadowOffsetX)}" dy="${formatNumber(style.shadowOffsetY)}" stdDeviation="${formatNumber(style.shadowBlur)}" flood-color="${style.shadowColor}" flood-opacity="${formatNumber(style.shadowOpacity)}"/>`,
        '</filter>',
        '</defs>'
    ].join('')
}

/**
 * Builds the badge group transform.
 * @param {{ x: number, y: number, rotation?: number }} badge
 * @param {number} scale
 * @returns {string}
 */
function badgeTransform(badge, scale) {
    const rotation = normalizeRotation(badge.rotation)
    const transforms = [
        `translate(${formatNumber(badge.x)} ${formatNumber(badge.y)})`
    ]
    if (rotation !== 0) transforms.push(`rotate(${formatNumber(rotation)})`)
    if (scale !== 1) transforms.push(`scale(${formatNumber(scale)})`)

    return transforms.join(' ')
}

/**
 * Adds the SVG shadow filter reference when enabled.
 * @param {{ shadowOpacity: number }} style
 * @returns {string}
 */
function shadowFilterAttribute(style) {
    return style.shadowOpacity > 0 ? ' filter="url(#pcb-badge-shadow)"' : ''
}

/**
 * Keeps badge text readable when the whole back-side scene is mirrored.
 * @param {'front' | 'back'} side
 * @returns {string}
 */
function badgeTextTransform(side) {
    return side === 'back' ? ' transform="scale(-1 1)"' : ''
}

/**
 * Resolves a badge font size from text length.
 * @param {string} text
 * @returns {number}
 */
function badgeFontSize(text) {
    if (text.length <= 1) return 3.2
    if (text.length === 2) return 2.6
    return 1.8
}

/**
 * Resolves visual baseline correction for badge text.
 * @param {string} text
 * @returns {number}
 */
function badgeTextOffset(text) {
    return badgeFontSize(text) * 0.34
}

/**
 * Normalizes badge rotation to a positive degree value.
 * @param {unknown} value
 * @returns {number}
 */
function normalizeRotation(value) {
    const rotation = Number(value)
    if (!Number.isFinite(rotation)) return 0

    const normalized = rotation % 360
    return normalized < 0 ? normalized + 360 : normalized
}

/**
 * Formats a number for compact SVG output.
 * @param {number} value
 * @returns {string}
 */
function formatNumber(value) {
    return Number(value || 0)
        .toFixed(4)
        .replace(/\.?0+$/u, '')
}

/**
 * Escapes text content.
 * @param {unknown} value
 * @returns {string}
 */
function escapeText(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
}

/**
 * Escapes attribute values.
 * @param {unknown} value
 * @returns {string}
 */
function escapeAttribute(value) {
    return escapeText(value).replaceAll('"', '&quot;')
}
