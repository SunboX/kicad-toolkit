// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Builds layer and material metadata attributes for SVG drawing primitives.
 * @param {{ layer?: unknown, material?: unknown }} item
 * @returns {string[]}
 */
export function drawingMetadataAttributeList(item) {
    return [
        dataAttribute('layer', item.layer),
        dataAttribute('material', item.material)
    ].filter(Boolean)
}

/**
 * Builds KiCad pad metadata attributes for SVG pad primitives.
 * @param {{ number?: unknown, type?: unknown, layers?: unknown }} pad
 * @returns {string[]}
 */
export function padMetadataAttributeList(pad) {
    return [
        dataAttribute('pad-number', pad.number),
        dataAttribute('pad-type', pad.type),
        dataAttribute('pad-layers', layerListValue(pad.layers))
    ].filter(Boolean)
}

/**
 * Builds one SVG data attribute when a value is present.
 * @param {string} name
 * @param {unknown} value
 * @returns {string}
 */
function dataAttribute(name, value) {
    const text = String(value ?? '').trim()
    return text ? `data-${name}="${escapeAttribute(text)}"` : ''
}

/**
 * Normalizes pad layer metadata for stable SVG output.
 * @param {unknown} value
 * @returns {string}
 */
function layerListValue(value) {
    if (Array.isArray(value)) {
        return value
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .join(' ')
    }

    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .join(' ')
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
