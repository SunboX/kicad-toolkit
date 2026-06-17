// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10]
const defaultPlaceholderSize = 10

/**
 * Renders schematic image payloads.
 */
export class SchematicSvgImageRenderer {
    /**
     * Renders all schematic images.
     * @param {object[]} images Image rows.
     * @returns {string}
     */
    static renderImages(images) {
        const rendered = (images || []).map(renderImage).join('')
        if (!rendered) return ''
        return `<g class="schematic-images">${rendered}</g>`
    }
}

/**
 * Renders one schematic image or a deterministic placeholder.
 * @param {object} image Image row.
 * @returns {string}
 */
function renderImage(image) {
    const payload = normalizedPayload(image?.data)
    const bytes = decodeBase64(payload)
    const dimensions = imageDimensions(image, bytes)

    if (payload && dimensions && bytes.length) {
        return `<image class="schematic-image" x="${formatNumber(image?.x)}" y="${formatNumber(image?.y)}" width="${formatNumber(dimensions.width)}" height="${formatNumber(dimensions.height)}" href="${escapeAttribute(dataUrl(image, payload))}" preserveAspectRatio="xMinYMin meet"/>`
    }

    return renderPlaceholder(image, dimensions)
}

/**
 * Renders a deterministic placeholder for missing image data or dimensions.
 * @param {object} image Image row.
 * @param {{ width: number, height: number } | null} dimensions Dimensions.
 * @returns {string}
 */
function renderPlaceholder(image, dimensions) {
    const size = placeholderDimensions(image, dimensions)
    return [
        `<g class="schematic-image-placeholder" data-diagnostic="${escapeAttribute(placeholderDiagnostic(image, dimensions))}">`,
        `<rect x="${formatNumber(image?.x)}" y="${formatNumber(image?.y)}" width="${formatNumber(size.width)}" height="${formatNumber(size.height)}" fill="none" stroke="var(--schematic-alert-color)" stroke-width="0.15" stroke-dasharray="1 0.8"/>`,
        `<path d="M ${formatNumber(image?.x)} ${formatNumber(image?.y)} L ${formatNumber(Number(image?.x || 0) + size.width)} ${formatNumber(Number(image?.y || 0) + size.height)} M ${formatNumber(Number(image?.x || 0) + size.width)} ${formatNumber(image?.y)} L ${formatNumber(image?.x)} ${formatNumber(Number(image?.y || 0) + size.height)}" fill="none" stroke="var(--schematic-alert-color)" stroke-width="0.15"/>`,
        '</g>'
    ].join('')
}

/**
 * Resolves a placeholder diagnostic token.
 * @param {object} image Image row.
 * @param {{ width: number, height: number } | null} dimensions Dimensions.
 * @returns {string}
 */
function placeholderDiagnostic(image, dimensions) {
    if (!normalizedPayload(image?.data)) return 'missing-payload'
    if (!dimensions) return 'missing-dimensions'
    return 'invalid-payload'
}

/**
 * Resolves an image data URL.
 * @param {object} image Image row.
 * @param {string} payload Base64 payload.
 * @returns {string}
 */
function dataUrl(image, payload) {
    return `data:${mimeType(image)};base64,${payload}`
}

/**
 * Resolves an image MIME type from the native format.
 * @param {object} image Image row.
 * @returns {string}
 */
function mimeType(image) {
    const format = String(image?.format || image?.nativeFormat || 'png')
        .replace(/^\./u, '')
        .toLowerCase()
    if (format === 'jpg' || format === 'jpeg') return 'image/jpeg'
    if (format === 'gif') return 'image/gif'
    if (format === 'bmp') return 'image/bmp'
    return 'image/png'
}

/**
 * Resolves scaled image dimensions from explicit fields or PNG bytes.
 * @param {object} image Image row.
 * @param {Uint8Array} bytes Payload bytes.
 * @returns {{ width: number, height: number } | null}
 */
function imageDimensions(image, bytes) {
    const explicit = explicitDimensions(image)
    if (explicit) return scaleDimensions(explicit, image)

    const png = pngDimensions(bytes)
    if (png) return scaleDimensions(png, image)

    return null
}

/**
 * Resolves explicit image dimensions.
 * @param {object} image Image row.
 * @returns {{ width: number, height: number } | null}
 */
function explicitDimensions(image) {
    const width =
        positiveNumber(image?.width) ||
        positiveNumber(image?.size?.width) ||
        positiveNumber(image?.nativeWidth)
    const height =
        positiveNumber(image?.height) ||
        positiveNumber(image?.size?.height) ||
        positiveNumber(image?.nativeHeight)
    if (!width || !height) return null
    return { width, height }
}

/**
 * Scales dimensions by the image scale.
 * @param {{ width: number, height: number }} dimensions Source dimensions.
 * @param {object} image Image row.
 * @returns {{ width: number, height: number }}
 */
function scaleDimensions(dimensions, image) {
    const scale = positiveNumber(image?.scale) || 1
    return {
        width: dimensions.width * scale,
        height: dimensions.height * scale
    }
}

/**
 * Resolves placeholder dimensions.
 * @param {object} image Image row.
 * @param {{ width: number, height: number } | null} dimensions Dimensions.
 * @returns {{ width: number, height: number }}
 */
function placeholderDimensions(image, dimensions) {
    if (dimensions) return dimensions
    const scale = positiveNumber(image?.scale) || 1
    return {
        width: defaultPlaceholderSize * scale,
        height: defaultPlaceholderSize * scale
    }
}

/**
 * Reads PNG dimensions from decoded payload bytes.
 * @param {Uint8Array} bytes Payload bytes.
 * @returns {{ width: number, height: number } | null}
 */
function pngDimensions(bytes) {
    if (!hasPngSignature(bytes) || bytes.length < 24) return null
    const width = uint32be(bytes, 16)
    const height = uint32be(bytes, 20)
    if (!width || !height) return null
    return { width, height }
}

/**
 * Checks PNG signature bytes.
 * @param {Uint8Array} bytes Payload bytes.
 * @returns {boolean}
 */
function hasPngSignature(bytes) {
    if (!bytes || bytes.length < pngSignature.length) return false
    return pngSignature.every((byte, index) => bytes[index] === byte)
}

/**
 * Reads one unsigned big-endian 32-bit integer.
 * @param {Uint8Array} bytes Payload bytes.
 * @param {number} offset Byte offset.
 * @returns {number}
 */
function uint32be(bytes, offset) {
    return (
        ((bytes[offset] << 24) |
            (bytes[offset + 1] << 16) |
            (bytes[offset + 2] << 8) |
            bytes[offset + 3]) >>>
        0
    )
}

/**
 * Normalizes base64 payload text.
 * @param {unknown} value Payload text.
 * @returns {string}
 */
function normalizedPayload(value) {
    return String(value || '').replace(/\s+/gu, '')
}

/**
 * Decodes a base64 value.
 * @param {string} value Base64 text.
 * @returns {Uint8Array}
 */
function decodeBase64(value) {
    if (!value) return new Uint8Array()

    try {
        const binary = globalThis.atob(value)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index)
        }
        return bytes
    } catch {
        return new Uint8Array()
    }
}

/**
 * Resolves a positive number.
 * @param {unknown} value Candidate value.
 * @returns {number | null}
 */
function positiveNumber(value) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? number : null
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

/**
 * Escapes attribute content.
 * @param {unknown} value Raw value.
 * @returns {string}
 */
function escapeAttribute(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}
