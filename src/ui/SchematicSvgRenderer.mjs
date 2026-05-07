// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Renders normalized KiCad schematic documents to deterministic SVG.
 */
export class SchematicSvgRenderer {
    /**
     * Renders one schematic document.
     * @param {object | null} documentModel Document model.
     * @returns {string}
     */
    static render(documentModel) {
        const schematic = documentModel?.schematic
        if (!schematic) return SchematicSvgRenderer.renderEmpty()

        const sheet = schematic.sheet || { width: 100, height: 80 }
        const width = Number(sheet.width || 100)
        const height = Number(sheet.height || 80)
        return [
            `<svg xmlns="http://www.w3.org/2000/svg" class="schematic-svg" viewBox="0 0 ${formatNumber(width)} ${formatNumber(height)}" role="img" aria-label="${escapeAttribute(documentModel.summary?.title || documentModel.fileName || 'Schematic')}">`,
            '<g class="schematic-scene">',
            renderSheetSymbols(schematic.sheetSymbols || []),
            renderRectangles(schematic.rectangles || []),
            renderLines(schematic.lines || []),
            renderPins(schematic.pins || []),
            renderJunctions(schematic.junctions || []),
            renderCrosses(schematic.crosses || []),
            renderTexts(schematic.texts || []),
            '</g></svg>'
        ].join('')
    }

    /**
     * Renders empty schematic SVG.
     * @returns {string}
     */
    static renderEmpty() {
        return [
            '<svg xmlns="http://www.w3.org/2000/svg" class="schematic-svg schematic-svg--empty" viewBox="0 0 100 60" role="img" aria-label="Drop schematic file">',
            '<rect x="1" y="1" width="98" height="58" rx="2" fill="#f8fafc" stroke="#94a3b8" stroke-width="0.4" stroke-dasharray="1.5 1"/>',
            '<text x="50" y="31" text-anchor="middle" fill="#1f2937" font-size="5">Drop schematic file</text>',
            '</svg>'
        ].join('')
    }
}

/**
 * Renders schematic lines.
 * @param {object[]} lines Lines.
 * @returns {string}
 */
function renderLines(lines) {
    return lines
        .map(
            (line) =>
                `<line class="schematic-line${line.isBus ? ' schematic-line--bus' : ''}" x1="${formatNumber(line.x1)}" y1="${formatNumber(line.y1)}" x2="${formatNumber(line.x2)}" y2="${formatNumber(line.y2)}" stroke="${escapeAttribute(line.color || '#1f2430')}" stroke-width="${formatNumber(line.width || 0.15)}" stroke-linecap="round"/>`
        )
        .join('')
}

/**
 * Renders rectangles.
 * @param {object[]} rectangles Rectangles.
 * @returns {string}
 */
function renderRectangles(rectangles) {
    return rectangles
        .map(
            (rectangle) =>
                `<rect class="schematic-rect" x="${formatNumber(rectangle.x)}" y="${formatNumber(rectangle.y)}" width="${formatNumber(rectangle.width)}" height="${formatNumber(rectangle.height)}" fill="${escapeAttribute(rectangle.fill || 'none')}" stroke="${escapeAttribute(rectangle.color || '#1f2430')}" stroke-width="${formatNumber(rectangle.lineWidth || 0.15)}"/>`
        )
        .join('')
}

/**
 * Renders hierarchical sheet symbols.
 * @param {object[]} sheets Sheets.
 * @returns {string}
 */
function renderSheetSymbols(sheets) {
    return sheets
        .map(
            (sheet) =>
                `<g class="schematic-sheet-symbol"><rect x="${formatNumber(sheet.x)}" y="${formatNumber(sheet.y)}" width="${formatNumber(sheet.width)}" height="${formatNumber(sheet.height)}" fill="${escapeAttribute(sheet.fill || '#f8fafc')}" stroke="${escapeAttribute(sheet.color || '#1f2430')}" stroke-width="0.2"/><text x="${formatNumber(sheet.x + 1)}" y="${formatNumber(sheet.y + 3)}" font-size="2.5" fill="#1f2430">${escapeHtml(sheet.name || '')}</text></g>`
        )
        .join('')
}

/**
 * Renders pins.
 * @param {object[]} pins Pins.
 * @returns {string}
 */
function renderPins(pins) {
    return pins
        .map((pin) => {
            const end = pinConnectionPoint(pin)
            return `<line class="schematic-pin-line" x1="${formatNumber(pin.x)}" y1="${formatNumber(pin.y)}" x2="${formatNumber(end.x)}" y2="${formatNumber(end.y)}" stroke="${escapeAttribute(pin.color || '#1f2430')}" stroke-width="0.12"/>`
        })
        .join('')
}

/**
 * Renders text nodes.
 * @param {object[]} texts Texts.
 * @returns {string}
 */
function renderTexts(texts) {
    return texts
        .map(
            (text) =>
                `<text class="schematic-text" x="${formatNumber(text.x)}" y="${formatNumber(text.y)}" fill="${escapeAttribute(text.color || '#1f2430')}" font-size="${formatNumber(text.fontSize || text.size || 2.2)}">${escapeHtml(text.text || text.value || '')}</text>`
        )
        .join('')
}

/**
 * Renders junction dots.
 * @param {object[]} junctions Junctions.
 * @returns {string}
 */
function renderJunctions(junctions) {
    return junctions
        .map(
            (junction) =>
                `<circle class="schematic-junction" cx="${formatNumber(junction.x)}" cy="${formatNumber(junction.y)}" r="${formatNumber((junction.diameter || 0.9) / 2)}" fill="${escapeAttribute(junction.color || '#1f2430')}"/>`
        )
        .join('')
}

/**
 * Renders no-connect crosses.
 * @param {object[]} crosses Crosses.
 * @returns {string}
 */
function renderCrosses(crosses) {
    return crosses
        .map((cross) => {
            const size = Number(cross.size || 1.5) / 2
            return `<path class="schematic-cross" d="M ${formatNumber(cross.x - size)} ${formatNumber(cross.y - size)} L ${formatNumber(cross.x + size)} ${formatNumber(cross.y + size)} M ${formatNumber(cross.x + size)} ${formatNumber(cross.y - size)} L ${formatNumber(cross.x - size)} ${formatNumber(cross.y + size)}" stroke="${escapeAttribute(cross.color || '#0f6b7a')}" stroke-width="0.15"/>`
        })
        .join('')
}

/**
 * Resolves pin connection point.
 * @param {object} pin Pin.
 * @returns {{ x: number, y: number }}
 */
function pinConnectionPoint(pin) {
    if (pin.orientation === 'left') return { x: pin.x - pin.length, y: pin.y }
    if (pin.orientation === 'right') return { x: pin.x + pin.length, y: pin.y }
    if (pin.orientation === 'top') return { x: pin.x, y: pin.y + pin.length }
    return { x: pin.x, y: pin.y - pin.length }
}

/**
 * Formats a number.
 * @param {number} value Number.
 * @returns {string}
 */
function formatNumber(value) {
    return Number(value || 0)
        .toFixed(3)
        .replace(/\.?0+$/, '')
}

/**
 * Escapes HTML content.
 * @param {unknown} value Raw value.
 * @returns {string}
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
}

/**
 * Escapes attribute content.
 * @param {unknown} value Raw value.
 * @returns {string}
 */
function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("'", '&#39;')
}
