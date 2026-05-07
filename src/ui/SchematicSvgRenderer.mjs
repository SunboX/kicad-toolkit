// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const displayScale = 10
const wireColor = 'var(--schematic-default-ink-color)'
const symbolColor = 'var(--schematic-power-color)'
const sheetGraphicColor = 'var(--schematic-accent-ink-color)'
const labelColor = 'var(--schematic-text-color)'
const globalLabelColor = 'var(--schematic-alert-color)'
const frameColor = 'var(--schematic-sheet-frame-stroke)'
const symbolFillColor = 'var(--schematic-fill-color)'

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
        const sourceWidth = Number(sheet.width || 100)
        const sourceHeight = Number(sheet.height || 80)
        const width = sourceWidth * displayScale
        const height = sourceHeight * displayScale
        const title = documentModel.summary?.title || documentModel.fileName || 'Schematic'
        const lineCount = (schematic.lines || []).length
        const componentCount = (schematic.components || []).length
        return [
            '<section class="svg-panel">',
            `<header class="svg-panel__header"><h3>${escapeHtml(title)}</h3><p>${lineCount} line segments, ${componentCount} components</p></header>`,
            `<svg xmlns="http://www.w3.org/2000/svg" class="schematic-svg" viewBox="0 0 ${formatNumber(width)} ${formatNumber(height)}" style="--schematic-sheet-frame-stroke: ${frameColor}; --schematic-sheet-label-color: ${frameColor}; --schematic-node-fill: ${wireColor}" role="img" aria-label="${escapeAttribute(documentModel.summary?.title || documentModel.fileName || 'Schematic')}">`,
            `<rect class="sheet-backdrop" x="0" y="0" width="${formatNumber(width)}" height="${formatNumber(height)}" rx="18"/>`,
            renderSheetChrome(sheet, width, height, documentModel?.fileName),
            `<g class="schematic-scene" transform="scale(${formatNumber(displayScale)})">`,
            renderSheetSymbols(schematic.sheetSymbols || []),
            renderRectangles(schematic.rectangles || []),
            renderLines(schematic.lines || []),
            renderPins(schematic.pins || []),
            renderJunctions(schematic.junctions || []),
            renderCrosses(schematic.crosses || []),
            renderTexts(schematic.texts || []),
            '</g></svg></section>'
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
                `<line class="schematic-line${line.isBus ? ' schematic-line--bus' : ''}" x1="${formatNumber(line.x1)}" y1="${formatNumber(line.y1)}" x2="${formatNumber(line.x2)}" y2="${formatNumber(line.y2)}" stroke="${resolveSchematicInkColor(line)}" stroke-width="${formatNumber(line.width || 0.15)}" stroke-linecap="round"/>`
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
                `<rect class="schematic-rect" x="${formatNumber(rectangle.x)}" y="${formatNumber(rectangle.y)}" width="${formatNumber(rectangle.width)}" height="${formatNumber(rectangle.height)}" fill="${resolveSchematicFillColor(rectangle)}" stroke="${resolveSchematicInkColor(rectangle)}" stroke-width="${formatNumber(rectangle.lineWidth || 0.15)}"/>`
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
                `<g class="schematic-sheet-symbol"><rect x="${formatNumber(sheet.x)}" y="${formatNumber(sheet.y)}" width="${formatNumber(sheet.width)}" height="${formatNumber(sheet.height)}" fill="none" stroke="${sheetGraphicColor}" stroke-width="0.2"/><text class="schematic-label" x="${formatNumber(sheet.x + 1)}" y="${formatNumber(sheet.y + 3)}" font-size="2.5" fill="${labelColor}">${escapeHtml(sheet.name || '')}</text></g>`
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
            return [
                `<line class="schematic-pin-line" x1="${formatNumber(pin.x)}" y1="${formatNumber(pin.y)}" x2="${formatNumber(end.x)}" y2="${formatNumber(end.y)}" stroke="${symbolColor}" stroke-width="0.08"/>`,
                renderPinNumber(pin)
            ].join('')
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
                `<text class="${resolveSchematicTextClass(text)}" x="${formatNumber(text.x)}" y="${formatNumber(text.y)}" fill="${resolveSchematicTextColor(text)}" font-size="${formatNumber(resolveTextFontSize(text))}" text-anchor="${resolveTextAnchor(text)}" dominant-baseline="${resolveTextBaseline(text)}"${renderTextTransform(text)}>${escapeHtml(text.text || text.value || '')}</text>`
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
                `<g class="schematic-node"><circle class="schematic-junction" cx="${formatNumber(junction.x)}" cy="${formatNumber(junction.y)}" r="${formatNumber((junction.diameter || 0.9) / 2)}" fill="${wireColor}"/></g>`
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
            return `<path class="schematic-cross" d="M ${formatNumber(cross.x - size)} ${formatNumber(cross.y - size)} L ${formatNumber(cross.x + size)} ${formatNumber(cross.y + size)} M ${formatNumber(cross.x + size)} ${formatNumber(cross.y - size)} L ${formatNumber(cross.x - size)} ${formatNumber(cross.y + size)}" stroke="${globalLabelColor}" stroke-width="0.15"/>`
        })
        .join('')
}

/**
 * Renders sheet frame, zone labels, and title block.
 * @param {object} sheet Sheet metadata.
 * @param {number} width Sheet width.
 * @param {number} height Sheet height.
 * @returns {string}
 */
function renderSheetChrome(sheet, width, height, fileName) {
    const margin = Number(sheet.marginWidth || 5) * displayScale
    const markup = []

    if (sheet.borderOn !== false) {
        markup.push(renderSheetFrame(sheet, width, height, margin))
    }

    if (sheet.titleBlockOn !== false) {
        markup.push(
            renderTitleBlock(sheet.titleBlock || {}, width, height, margin, {
                paperSize: sheet.paperSize,
                fileName
            })
        )
    }

    return markup.join('')
}

/**
 * Renders a sheet border and zone labels.
 * @param {object} sheet Sheet metadata.
 * @param {number} width Sheet width.
 * @param {number} height Sheet height.
 * @param {number} margin Sheet margin.
 * @returns {string}
 */
function renderSheetFrame(sheet, width, height, margin) {
    const left = margin
    const top = margin
    const frameWidth = Math.max(width - margin * 2, 0)
    const frameHeight = Math.max(height - margin * 2, 0)
    const xZones = Math.max(Number(sheet.xZones || 0), 0)
    const yZones = Math.max(Number(sheet.yZones || 0), 0)
    const parts = [
        `<rect class="sheet-frame" x="${formatNumber(left)}" y="${formatNumber(top)}" width="${formatNumber(frameWidth)}" height="${formatNumber(frameHeight)}"/>`
    ]

    for (let index = 1; index < xZones; index += 1) {
        const x = left + (frameWidth / xZones) * index
        parts.push(
            `<line class="sheet-zone-separator" x1="${formatNumber(x)}" y1="0" x2="${formatNumber(x)}" y2="${formatNumber(top)}"/>`,
            `<line class="sheet-zone-separator" x1="${formatNumber(x)}" y1="${formatNumber(height - margin)}" x2="${formatNumber(x)}" y2="${formatNumber(height)}"/>`
        )
    }

    for (let index = 0; index < xZones; index += 1) {
        const label = String(index + 1)
        const x = left + (frameWidth / xZones) * (index + 0.5)
        parts.push(
            `<text class="sheet-zone-label" x="${formatNumber(x)}" y="${formatNumber(margin / 2)}" text-anchor="middle" fill="${frameColor}">${label}</text>`,
            `<text class="sheet-zone-label" x="${formatNumber(x)}" y="${formatNumber(height - margin / 2)}" text-anchor="middle" fill="${frameColor}">${label}</text>`
        )
    }

    for (let index = 1; index < yZones; index += 1) {
        const y = top + (frameHeight / yZones) * index
        parts.push(
            `<line class="sheet-zone-separator" x1="0" y1="${formatNumber(y)}" x2="${formatNumber(left)}" y2="${formatNumber(y)}"/>`,
            `<line class="sheet-zone-separator" x1="${formatNumber(width - margin)}" y1="${formatNumber(y)}" x2="${formatNumber(width)}" y2="${formatNumber(y)}"/>`
        )
    }

    for (let index = 0; index < yZones; index += 1) {
        const label = String.fromCharCode(65 + index)
        const y = top + (frameHeight / yZones) * (index + 0.5)
        parts.push(
            `<text class="sheet-zone-label" x="${formatNumber(margin / 2)}" y="${formatNumber(y)}" text-anchor="middle" fill="${frameColor}">${label}</text>`,
            `<text class="sheet-zone-label" x="${formatNumber(width - margin / 2)}" y="${formatNumber(y)}" text-anchor="middle" fill="${frameColor}">${label}</text>`
        )
    }

    return parts.join('')
}

/**
 * Renders a compact title block.
 * @param {object} titleBlock Title block metadata.
 * @param {number} width Sheet width.
 * @param {number} height Sheet height.
 * @param {number} margin Sheet margin.
 * @returns {string}
 */
function renderTitleBlock(titleBlock, width, height, margin, options = {}) {
    const blockWidth = Math.min(
        Math.max(width - margin * 2, 100),
        Math.max(Math.min(480, width * 0.34), 140)
    )
    const blockHeight = Math.min(
        Math.max(height - margin * 2, 100),
        Math.max(Math.min(138, height * 0.18), 102)
    )
    const x = Math.max(width - margin - blockWidth, margin)
    const y = Math.max(height - margin - blockHeight, margin)
    const title = titleBlock.title || ''
    const revision = titleBlock.revision || ''
    const date = titleBlock.date || ''
    const company = titleBlock.documentNumber || ''
    const author = titleBlock.drawnBy || ''
    const fileName = basename(options.fileName || '')
    const paperSize = options.paperSize || ''
    return [
        '<g class="sheet-title-block">',
        `<rect x="${formatNumber(x)}" y="${formatNumber(y)}" width="${formatNumber(blockWidth)}" height="${formatNumber(blockHeight)}"/>`,
        `<line x1="${formatNumber(x)}" y1="${formatNumber(y + blockHeight * 0.42)}" x2="${formatNumber(x + blockWidth)}" y2="${formatNumber(y + blockHeight * 0.42)}"/>`,
        `<line x1="${formatNumber(x)}" y1="${formatNumber(y + blockHeight * 0.62)}" x2="${formatNumber(x + blockWidth)}" y2="${formatNumber(y + blockHeight * 0.62)}"/>`,
        `<line x1="${formatNumber(x)}" y1="${formatNumber(y + blockHeight * 0.8)}" x2="${formatNumber(x + blockWidth)}" y2="${formatNumber(y + blockHeight * 0.8)}"/>`,
        `<line x1="${formatNumber(x + blockWidth * 0.22)}" y1="${formatNumber(y + blockHeight * 0.8)}" x2="${formatNumber(x + blockWidth * 0.22)}" y2="${formatNumber(y + blockHeight)}"/>`,
        `<line x1="${formatNumber(x + blockWidth * 0.68)}" y1="${formatNumber(y + blockHeight * 0.8)}" x2="${formatNumber(x + blockWidth * 0.68)}" y2="${formatNumber(y + blockHeight)}"/>`,
        renderTitlePair('', author, x + 10, y + blockHeight * 0.24),
        renderTitlePair('', company, x + 10, y + blockHeight * 0.36),
        renderTitlePair('File', fileName, x + 10, y + blockHeight * 0.56),
        renderTitlePair('Title', title, x + 10, y + blockHeight * 0.74),
        renderTitlePair('Size', paperSize, x + 10, y + blockHeight * 0.93),
        renderTitlePair('Date', date, x + blockWidth * 0.25, y + blockHeight * 0.93),
        renderTitlePair('Rev', revision, x + blockWidth * 0.72, y + blockHeight * 0.93),
        '</g>'
    ].join('')
}

/**
 * Renders one title-block label/value pair.
 * @param {string} label Label.
 * @param {string} value Value.
 * @param {number} x X coordinate.
 * @param {number} y Y coordinate.
 * @returns {string}
 */
function renderTitlePair(label, value, x, y) {
    const renderedLabel = label
        ? `<text class="sheet-title-label" x="${formatNumber(x)}" y="${formatNumber(y)}" fill="${frameColor}">${escapeHtml(label)}</text>`
        : ''
    const valueX = label ? x + 54 : x
    return [
        renderedLabel,
        `<text class="sheet-title-value" x="${formatNumber(valueX)}" y="${formatNumber(y)}" fill="${frameColor}">${escapeHtml(value)}</text>`
    ].join('')
}

/**
 * Renders one KiCad pin number near the symbol body.
 * @param {object} pin Pin.
 * @returns {string}
 */
function renderPinNumber(pin) {
    const label = String(pin.designator || '').trim()
    if (!label || label === '~' || pin.numberVisible === false) return ''
    const offset = 0.35
    const fontSize = Number(pin.numberFontSize || 0.85)
    const x =
        pin.orientation === 'left'
            ? pin.x + offset
            : pin.orientation === 'right'
              ? pin.x - offset
              : pin.x + offset
    const y =
        pin.orientation === 'top'
            ? pin.y - offset
            : pin.orientation === 'bottom'
              ? pin.y + offset
              : pin.y - offset
    const anchor = pin.orientation === 'right' ? 'end' : 'start'
    return `<text class="schematic-pin-number" x="${formatNumber(x)}" y="${formatNumber(y)}" fill="${symbolColor}" font-size="${formatNumber(fontSize)}" text-anchor="${anchor}" dominant-baseline="central">${escapeHtml(label)}</text>`
}

/**
 * Resolves the visible color of a KiCad symbol pin line.
 * @param {object} pin Pin.
 * @returns {string}
 */
/**
 * Resolves schematic primitive stroke color.
 * @param {object} primitive Primitive.
 * @returns {string}
 */
function resolveSchematicInkColor(primitive) {
    if (primitive?.ownerIndex) return symbolColor
    if (primitive?.sourceType === 'polyline') return sheetGraphicColor
    if (primitive?.isBus) return sheetGraphicColor
    return wireColor
}

/**
 * Resolves schematic rectangle fill color.
 * @param {object} primitive Primitive.
 * @returns {string}
 */
function resolveSchematicFillColor(primitive) {
    if (primitive?.fill === 'outline') {
        return symbolColor
    }

    if (primitive?.fill && primitive.fill !== 'none') {
        return symbolFillColor
    }

    return 'none'
}

/**
 * Resolves schematic text class names.
 * @param {object} text Text primitive.
 * @returns {string}
 */
function resolveSchematicTextClass(text) {
    return text?.labelKind ? 'schematic-text schematic-label' : 'schematic-text'
}

/**
 * Resolves schematic text color.
 * @param {object} text Text primitive.
 * @returns {string}
 */
function resolveSchematicTextColor(text) {
    if (text?.ownerIndex) return labelColor
    if (text?.labelKind === 'global') return globalLabelColor
    if (text?.labelKind === 'hierarchical') return sheetGraphicColor
    if (text?.labelKind === 'local') return labelColor
    return labelColor
}

/**
 * Resolves SVG text-anchor from parsed KiCad justification.
 * @param {object} text Text primitive.
 * @returns {'start' | 'middle' | 'end'}
 */
function resolveTextAnchor(text) {
    if (['start', 'middle', 'end'].includes(text?.anchor)) return text.anchor
    const hAlign = text?.font?.hAlign
    if (hAlign === 'right') return 'end'
    if (hAlign === 'center') return 'middle'
    return 'start'
}

/**
 * Resolves SVG baseline from parsed KiCad justification.
 * @param {object} text Text primitive.
 * @returns {string}
 */
function resolveTextBaseline(text) {
    const vAlign = text?.vAlign || text?.font?.vAlign
    if (vAlign === 'top') return 'hanging'
    if (vAlign === 'center') return 'central'
    return 'alphabetic'
}

/**
 * Resolves browser font size from KiCad stroke-font height.
 * @param {object} text Text primitive.
 * @returns {number}
 */
function resolveTextFontSize(text) {
    return Number(text?.fontSize || text?.size || 2.2) * (4 / 3)
}

/**
 * Renders a rotation transform for KiCad text.
 * @param {object} text Text primitive.
 * @returns {string}
 */
function renderTextTransform(text) {
    const rotation = -resolveReadableTextRotation(text)
    if (Math.abs(rotation) < 0.001) return ''
    return ` transform="rotate(${formatNumber(rotation)} ${formatNumber(text.x)} ${formatNumber(text.y)})"`
}

/**
 * Resolves the display rotation for KiCad text while keeping flipped labels readable.
 * @param {object} text Text primitive.
 * @returns {number}
 */
function resolveReadableTextRotation(text) {
    const rotation = Number(text?.rotation || 0)
    if (!Number.isFinite(rotation)) return 0
    const normalized = ((rotation % 360) + 360) % 360
    if (Math.abs(normalized - 180) < 0.001) return 0
    if (normalized > 180) return normalized - 360
    return normalized
}

/**
 * Resolves pin connection point.
 * @param {object} pin Pin.
 * @returns {{ x: number, y: number }}
 */
function pinConnectionPoint(pin) {
    if (pin.orientation === 'left') return { x: pin.x - pin.length, y: pin.y }
    if (pin.orientation === 'right') return { x: pin.x + pin.length, y: pin.y }
    if (pin.orientation === 'top') return { x: pin.x, y: pin.y - pin.length }
    return { x: pin.x, y: pin.y + pin.length }
}

/**
 * Returns the file basename.
 * @param {string} value Path-like value.
 * @returns {string}
 */
function basename(value) {
    return String(value || '')
        .split(/[\\/]/u)
        .filter(Boolean)
        .at(-1) || ''
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
