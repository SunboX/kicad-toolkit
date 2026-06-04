// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const roundedStrokeAttributes = 'stroke-linecap="round" stroke-linejoin="round"'

/**
 * Renders auxiliary KiCad PCB drawing primitives that are not core copper items.
 */
export class PcbSvgAuxiliaryRenderer {
    /**
     * Renders an image placeholder.
     * @param {object} image Image primitive.
     * @param {{ stroke: string, layerStyle: object }} style Drawing style.
     * @returns {string}
     */
    static renderImagePlaceholder(image, style) {
        return `<rect class="pcb-image" x="${formatNumber(image.x)}" y="${formatNumber(image.y)}" width="${formatNumber(image.width)}" height="${formatNumber(image.height)}" fill="none" stroke="${style.stroke}" stroke-width="${formatNumber(resolveStrokeWidth(style.layerStyle, 0.1))}" stroke-dasharray="0.4 0.25"/>`
    }

    /**
     * Renders a barcode placeholder.
     * @param {object} barcode Barcode primitive.
     * @param {{ stroke: string, layerStyle: object }} style Drawing style.
     * @returns {string}
     */
    static renderBarcode(barcode, style) {
        const transform = `rotate(${formatNumber(barcode.rotation || 0)} ${formatNumber(barcode.x)} ${formatNumber(barcode.y)})`
        const label = escapeAttribute(
            barcode.text || barcode.barcodeType || 'barcode'
        )
        return `<rect class="pcb-barcode" aria-label="${label}" x="${formatNumber(barcode.x)}" y="${formatNumber(barcode.y)}" width="${formatNumber(barcode.width)}" height="${formatNumber(barcode.height)}" fill="none" stroke="${style.stroke}" stroke-width="${formatNumber(resolveStrokeWidth(style.layerStyle, 0.1))}" transform="${transform}"/>`
    }

    /**
     * Renders a KiCad target marker.
     * @param {object} target Target primitive.
     * @param {{ stroke: string, layerStyle: object }} style Drawing style.
     * @returns {string}
     */
    static renderTarget(target, style) {
        const half = target.size / 2
        const strokeWidth = formatNumber(
            resolveStrokeWidth(style.layerStyle, target.strokeWidth || 0.1)
        )
        const lines =
            target.shape === 'x'
                ? [
                      [
                          target.x - half,
                          target.y - half,
                          target.x + half,
                          target.y + half
                      ],
                      [
                          target.x - half,
                          target.y + half,
                          target.x + half,
                          target.y - half
                      ]
                  ]
                : [
                      [target.x - half, target.y, target.x + half, target.y],
                      [target.x, target.y - half, target.x, target.y + half]
                  ]
        return `<g class="pcb-target" stroke="${style.stroke}" stroke-width="${strokeWidth}" ${roundedStrokeAttributes}>${lines
            .map((line) => {
                return `<line x1="${formatNumber(line[0])}" y1="${formatNumber(line[1])}" x2="${formatNumber(line[2])}" y2="${formatNumber(line[3])}"/>`
            })
            .join('')}</g>`
    }

    /**
     * Renders a KiCad point marker.
     * @param {object} point Point primitive.
     * @param {{ stroke: string, fill: string, layerStyle: object }} style Drawing style.
     * @returns {string}
     */
    static renderPoint(point, style) {
        return `<circle class="pcb-point" cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="${formatNumber(point.size / 2)}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="${formatNumber(resolveStrokeWidth(style.layerStyle, 0.08))}"/>`
    }
}

/**
 * Resolves an automatic or explicit layer stroke width.
 * @param {{ borderWidth?: number | null }} style Layer style.
 * @param {number} fallback Fallback width.
 * @returns {number}
 */
function resolveStrokeWidth(style, fallback) {
    if (style.borderWidth === null || style.borderWidth === undefined) {
        return fallback
    }

    return Math.max(Number(style.borderWidth) || 0, 0)
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

/**
 * Escapes text content.
 * @param {unknown} value Raw value.
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
 * @param {unknown} value Raw value.
 * @returns {string}
 */
function escapeAttribute(value) {
    return escapeText(value).replaceAll('"', '&quot;')
}
