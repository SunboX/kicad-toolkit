// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { SchematicSvgShapeRenderer } from './SchematicSvgShapeRenderer.mjs'

/**
 * Renders schematic frame-like annotation objects such as text boxes and tables.
 */
export class SchematicSvgFrameRenderer {
    /**
     * Renders all supported schematic frame objects.
     * @param {object} schematic Schematic model.
     * @param {object} options Renderer callbacks.
     * @returns {string}
     */
    static renderFrames(schematic, options) {
        return [
            renderTextBoxes(schematic?.textBoxes || [], options),
            renderTables(schematic?.tables || [], options)
        ].join('')
    }
}

/**
 * Renders schematic text boxes.
 * @param {object[]} textBoxes Text boxes.
 * @param {object} options Renderer callbacks.
 * @returns {string}
 */
function renderTextBoxes(textBoxes, options) {
    return textBoxes
        .map((textBox) => {
            return wrapFrameGroup(
                'schematic-text-box',
                textBox,
                [
                    renderFrameRect(
                        textBox,
                        'schematic-text-box-frame',
                        options
                    ),
                    renderFrameText(textBox, 'schematic-text-box-text', options)
                ].join('')
            )
        })
        .join('')
}

/**
 * Renders schematic tables.
 * @param {object[]} tables Table models.
 * @param {object} options Renderer callbacks.
 * @returns {string}
 */
function renderTables(tables, options) {
    return tables
        .map((table) => {
            const cells = (table.cells || [])
                .map((cell) => renderTableCell(cell, options))
                .join('')
            return `<g class="schematic-table">${cells}</g>`
        })
        .join('')
}

/**
 * Renders one table cell.
 * @param {object} cell Table cell.
 * @param {object} options Renderer callbacks.
 * @returns {string}
 */
function renderTableCell(cell, options) {
    return wrapFrameGroup(
        'schematic-table-cell',
        cell,
        [
            renderFrameRect(cell, 'schematic-table-cell-frame', options),
            renderFrameText(cell, 'schematic-table-cell-text', options)
        ].join('')
    )
}

/**
 * Wraps a rendered frame in an optional rotation group.
 * @param {string} className Group class.
 * @param {object} frame Frame model.
 * @param {string} content Inner markup.
 * @returns {string}
 */
function wrapFrameGroup(className, frame, content) {
    if (!content) return ''
    return `<g class="${className}"${rotationTransform(frame)}>${content}</g>`
}

/**
 * Renders a text box or table-cell frame rectangle.
 * @param {object} frame Frame model.
 * @param {string} className Rect class name.
 * @param {object} options Renderer callbacks.
 * @returns {string}
 */
function renderFrameRect(frame, className, options) {
    const strokeWidth = effectiveStrokeWidth(frame?.lineWidth)
    const stroke = strokeWidth > 0 ? options.resolveInkColor(frame) : 'none'
    const dash =
        strokeWidth > 0
            ? SchematicSvgShapeRenderer.strokeStyleAttributes(
                  frame,
                  strokeWidth
              )
            : ''
    return `<rect class="${className}" x="${formatNumber(frame?.x)}" y="${formatNumber(frame?.y)}" width="${formatNumber(frame?.width)}" height="${formatNumber(frame?.height)}" fill="${options.resolveFillColor(frame)}" stroke="${stroke}" stroke-width="${formatNumber(strokeWidth)}"${dash}/>`
}

/**
 * Renders text inside a frame.
 * @param {object} frame Frame model.
 * @param {string} className Text class name.
 * @param {object} options Renderer callbacks.
 * @returns {string}
 */
function renderFrameText(frame, className, options) {
    const value = String(frame?.text ?? frame?.value ?? '')
    if (!value) return ''
    const anchor = textAnchor(frame)
    return options.renderStrokeText({
        className,
        x: anchor.x,
        y: anchor.y,
        value,
        color: options.resolveInkColor(frame),
        sizeX: positiveTextSize(frame?.font?.width, frame?.fontSize),
        sizeY: positiveTextSize(frame?.font?.height, frame?.fontSize),
        hAlign: resolveTextHAlign(frame),
        vAlign: resolveTextVAlign(frame),
        rotation: 0
    })
}

/**
 * Resolves the text anchor point inside a frame's margins.
 * @param {object} frame Frame model.
 * @returns {{ x: number, y: number }}
 */
function textAnchor(frame) {
    const margins = normalizedMargins(frame?.margins)
    const x = Number(frame?.x || 0)
    const y = Number(frame?.y || 0)
    const width = Number(frame?.width || 0)
    const height = Number(frame?.height || 0)
    const left = x + margins.left
    const right = x + Math.max(width - margins.right, margins.left)
    const top = y + margins.top
    const bottom = y + Math.max(height - margins.bottom, margins.top)
    return {
        x: alignedCoordinate(left, right, resolveTextHAlign(frame)),
        y: alignedCoordinate(top, bottom, resolveTextVAlign(frame))
    }
}

/**
 * Resolves one aligned coordinate in a bounded range.
 * @param {number} start Start coordinate.
 * @param {number} end End coordinate.
 * @param {string} align Alignment token.
 * @returns {number}
 */
function alignedCoordinate(start, end, align) {
    if (align === 'center') return start + (end - start) / 2
    if (align === 'right' || align === 'bottom') return end
    return start
}

/**
 * Normalizes frame margins.
 * @param {object | undefined} margins Margins.
 * @returns {{ left: number, top: number, right: number, bottom: number }}
 */
function normalizedMargins(margins) {
    return {
        left: Number(margins?.left || 0),
        top: Number(margins?.top || 0),
        right: Number(margins?.right || 0),
        bottom: Number(margins?.bottom || 0)
    }
}

/**
 * Resolves frame text horizontal alignment.
 * @param {object} frame Frame model.
 * @returns {'left' | 'center' | 'right'}
 */
function resolveTextHAlign(frame) {
    const align = frame?.font?.hAlign
    if (align === 'center' || align === 'right') return align
    return 'left'
}

/**
 * Resolves frame text vertical alignment.
 * @param {object} frame Frame model.
 * @returns {'top' | 'center' | 'bottom'}
 */
function resolveTextVAlign(frame) {
    const align = frame?.font?.vAlign
    if (align === 'center' || align === 'bottom') return align
    return 'top'
}

/**
 * Resolves an effective text size.
 * @param {number | undefined} primary Primary size.
 * @param {number | undefined} secondary Secondary size.
 * @returns {number}
 */
function positiveTextSize(primary, secondary) {
    const value = Number(primary) || Number(secondary) || 1
    return Math.max(value, 0.001)
}

/**
 * Resolves KiCad's effective frame stroke width.
 * @param {number | undefined} width Stroke width.
 * @returns {number}
 */
function effectiveStrokeWidth(width) {
    const resolved = Number(width)
    if (Number.isFinite(resolved) && resolved < 0) return 0
    if (!Number.isFinite(resolved) || Math.abs(resolved) < 0.001) return 0.15
    return resolved
}

/**
 * Renders an optional frame rotation transform.
 * @param {object} frame Frame model.
 * @returns {string}
 */
function rotationTransform(frame) {
    const rotation = Number(frame?.rotation || 0)
    if (Math.abs(rotation) < 0.001) return ''
    return ` transform="rotate(${formatNumber(rotation)} ${formatNumber(frame?.x)} ${formatNumber(frame?.y)})"`
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
