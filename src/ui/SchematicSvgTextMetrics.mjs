// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadStrokeFont } from './KicadStrokeFont.mjs'

const kicadTextLineSpacingRatio = 1.61
const kicadFirstLineHeightRatio = 1.17
const kicadStrokeBaselineFudgeRatio = 0.052
const kicadStrokeHorizontalFudgeRatio = 1.52
const kicadTextBoxFudgeRatio = 0.17
const kicadLocalLabelTextOffsetRatio = 0.15

/**
 * Exposes KiCad schematic stroke-text placement metrics for renderer consumers.
 */
export class SchematicSvgTextMetrics {
    /**
     * Applies KiCad's symbol-field placement transform.
     * @param {object} sourceText Source schematic text.
     * @param {object} renderedText Render-ready text.
     * @returns {object}
     */
    static applySymbolFieldPlacement(sourceText, renderedText) {
        return applySymbolFieldPlacement(sourceText, renderedText)
    }

    /**
     * Applies schematic-item text offsets before stroke-font positioning.
     * @param {object} sourceText Source schematic text.
     * @param {object} renderedText Render-ready text.
     * @returns {object}
     */
    static applySchematicTextOffset(sourceText, renderedText) {
        return applySchematicTextOffset(sourceText, renderedText)
    }

    /**
     * Resolves the SVG rotation direction for one rendered text node.
     * @param {object} text Text primitive.
     * @returns {number}
     */
    static resolveRenderedTextRotation(text) {
        return resolveRenderedTextRotation(text)
    }

    /**
     * Calculates KiCad-like baseline spacing for multiline text.
     * @param {object} text Text item.
     * @returns {number}
     */
    static textLineSpacing(text) {
        return textLineSpacing(text)
    }

    /**
     * Resolves KiCad's vertical stroke size for font and baseline metrics.
     * @param {object} text Text item.
     * @returns {number}
     */
    static textHeight(text) {
        return textHeight(text)
    }

    /**
     * Resolves KiCad's horizontal stroke size for glyph scaling.
     * @param {object} text Text item.
     * @returns {number}
     */
    static textWidth(text) {
        return textWidth(text)
    }

    /**
     * Calculates line origin from KiCad horizontal justification.
     * @param {object} text Text item.
     * @param {number} lineWidth Line width.
     * @returns {number}
     */
    static textLineX(text, lineWidth) {
        return textLineX(text, lineWidth)
    }

    /**
     * Calculates one line baseline from KiCad vertical justification.
     * @param {object} text Text item.
     * @param {number} index Line index.
     * @param {number} lineCount Total line count.
     * @param {number} lineSpacing Line spacing.
     * @returns {number}
     */
    static textLineY(text, index, lineCount, lineSpacing) {
        return textLineY(text, index, lineCount, lineSpacing)
    }

    /**
     * Resolves KiCad text stroke width.
     * @param {object} text Text item.
     * @returns {number}
     */
    static textStrokeWidth(text) {
        return textStrokeWidth(text)
    }
}

/**
 * Applies KiCad's symbol-field box transform and center-justified draw point.
 * @param {object} sourceText Source schematic text.
 * @param {object} renderedText Render-ready text.
 * @returns {object}
 */
export function applySymbolFieldPlacement(sourceText, renderedText) {
    if (!sourceText?.symbolField) return renderedText
    const center = symbolFieldDrawCenter(sourceText, renderedText)
    return {
        ...renderedText,
        x: center.x,
        y: center.y,
        hAlign: 'center',
        vAlign: 'center'
    }
}

/**
 * Applies schematic-item text offsets before KiCad stroke-font positioning.
 * @param {object} sourceText Source schematic text.
 * @param {object} renderedText Render-ready text.
 * @returns {object}
 */
export function applySchematicTextOffset(sourceText, renderedText) {
    if (sourceText?.labelKind !== 'local') return renderedText
    const offset = localLabelTextOffset(renderedText)
    return {
        ...renderedText,
        x: renderedText.x + offset.x,
        y: renderedText.y + offset.y
    }
}

/**
 * Resolves the SVG rotation direction for one rendered text node.
 * @param {object} text Text primitive.
 * @returns {number}
 */
export function resolveRenderedTextRotation(text) {
    const rotation = -resolveReadableTextRotation(text)
    if (text?.symbolKind !== 'power') return rotation
    if (Math.abs(Math.abs(rotation) - 90) > 0.001) return rotation
    return rotation < 0 ? rotation + 180 : rotation - 180
}

/**
 * Calculates KiCad-like baseline spacing for multiline text.
 * @param {object} text Text item.
 * @returns {number}
 */
export function textLineSpacing(text) {
    return textHeight(text) * kicadTextLineSpacingRatio
}

/**
 * Resolves KiCad's vertical stroke size for font and baseline metrics.
 * @param {object} text Text item.
 * @returns {number}
 */
export function textHeight(text) {
    return positiveTextSize(text.sizeY, text.sizeX)
}

/**
 * Resolves KiCad's horizontal stroke size for glyph scaling.
 * @param {object} text Text item.
 * @returns {number}
 */
export function textWidth(text) {
    return positiveTextSize(text.sizeX, text.sizeY)
}

/**
 * Calculates line origin from KiCad horizontal justification.
 * @param {object} text Text item.
 * @param {number} lineWidth Line width.
 * @returns {number}
 */
export function textLineX(text, lineWidth) {
    const offset = textStrokeHorizontalFudge(text)
    if (text.hAlign === 'left') return text.x + offset
    if (text.hAlign === 'right') return text.x - (lineWidth + offset)
    return text.x - lineWidth / 2
}

/**
 * Calculates one line baseline from KiCad vertical justification.
 * @param {object} text Text item.
 * @param {number} index Line index.
 * @param {number} lineCount Total line count.
 * @param {number} lineSpacing Line spacing.
 * @returns {number}
 */
export function textLineY(text, index, lineCount, lineSpacing) {
    const height = textHeight(text)
    const blockHeight =
        height * kicadFirstLineHeightRatio + lineSpacing * (lineCount - 1)
    let baseline = text.y + height - textStrokeBaselineFudge(text)

    if (text.vAlign === 'bottom') {
        baseline -= blockHeight
    } else if (text.vAlign === 'center') {
        baseline -= blockHeight / 2
    }

    return baseline + lineSpacing * index
}

/**
 * Resolves KiCad text stroke width.
 * @param {object} text Text item.
 * @returns {number}
 */
export function textStrokeWidth(text) {
    return Math.max(Number(text.thickness) || 0.12, 0.01)
}

/**
 * Calculates the center KiCad uses when rendering a placed symbol field.
 * @param {object} sourceText Source schematic text.
 * @param {object} renderedText Render-ready text.
 * @returns {{ x: number, y: number }}
 */
function symbolFieldDrawCenter(sourceText, renderedText) {
    const textPosition = inverseTransformSymbolFieldPoint(
        { x: sourceText.x, y: sourceText.y },
        sourceText.symbolField
    )
    const box = symbolFieldTextBox(sourceText, renderedText, textPosition)
    const begin = rotatePoint(
        box.origin,
        textPosition,
        sourceText.symbolField.textRotation
    )
    const end = rotatePoint(
        box.end,
        textPosition,
        sourceText.symbolField.textRotation
    )
    const transformedBegin = transformSymbolFieldPoint(
        begin,
        sourceText.symbolField
    )
    const transformedEnd = transformSymbolFieldPoint(
        end,
        sourceText.symbolField
    )
    return {
        x: (transformedBegin.x + transformedEnd.x) / 2,
        y: (transformedBegin.y + transformedEnd.y) / 2
    }
}

/**
 * Builds KiCad's unrotated text box for a symbol field.
 * @param {object} sourceText Source schematic text.
 * @param {object} renderedText Render-ready text.
 * @param {{ x: number, y: number }} textPosition Local text position.
 * @returns {{ origin: { x: number, y: number }, end: { x: number, y: number } }}
 */
function symbolFieldTextBox(sourceText, renderedText, textPosition) {
    const lines = String(renderedText.value || '').split('\n')
    const width = Math.max(
        ...lines.map((line) =>
            KicadStrokeFont.measureLine(line, textWidth(renderedText))
        ),
        0
    )
    const height = symbolFieldTextBoxHeight(renderedText, lines)
    const fudge = textHeight(renderedText) * kicadTextBoxFudgeRatio
    const hAlign = sourceText.symbolField.hAlign || renderedText.hAlign
    const vAlign = sourceText.symbolField.vAlign || renderedText.vAlign
    let x = textPosition.x
    let y = textPosition.y

    if (hAlign === 'center') x -= width / 2
    if (hAlign === 'right') x -= width

    if (vAlign === 'top') {
        y -= fudge
    } else if (vAlign === 'center') {
        y -= height / 2
    } else if (vAlign === 'bottom') {
        y -= height
        y += fudge
    }

    return {
        origin: { x, y },
        end: { x: x + width, y: y + height }
    }
}

/**
 * Calculates KiCad's stroke text box height for a symbol field.
 * @param {object} text Render-ready text.
 * @param {string[]} lines Text lines.
 * @returns {number}
 */
function symbolFieldTextBoxHeight(text, lines) {
    const baseHeight =
        textHeight(text) * kicadFirstLineHeightRatio +
        textLineSpacing(text) * Math.max(lines.length - 1, 0)
    if (lines.some((line) => line.includes('~{'))) {
        return baseHeight + textHeight(text) / 6
    }
    return baseHeight
}

/**
 * Mirrors KiCad SCH_FIELD::SetPosition() for placed symbol fields.
 * @param {{ x: number, y: number }} point Display-space field position.
 * @param {object} field Field transform metadata.
 * @returns {{ x: number, y: number }}
 */
function inverseTransformSymbolFieldPoint(point, field) {
    const origin = { x: field.symbolX, y: field.symbolY }
    const rotation = ((Number(field.symbolRotation) || 0) % 360) + 360
    const unrotated = rotatePoint(point, origin, (360 - (rotation % 360)) % 360)
    let x = unrotated.x - origin.x
    let y = unrotated.y - origin.y

    if (field.symbolMirror === 'x') y = -y
    if (field.symbolMirror === 'y') x = -x

    return {
        x: origin.x + x,
        y: origin.y + y
    }
}

/**
 * Applies a KiCad symbol placement transform to one field-box point.
 * @param {{ x: number, y: number }} point Point.
 * @param {object} field Field transform metadata.
 * @returns {{ x: number, y: number }}
 */
function transformSymbolFieldPoint(point, field) {
    const origin = { x: field.symbolX, y: field.symbolY }
    let x = point.x - origin.x
    let y = point.y - origin.y

    if (field.symbolMirror === 'x') y = -y
    if (field.symbolMirror === 'y') x = -x

    return rotatePoint(
        { x: origin.x + x, y: origin.y + y },
        origin,
        field.symbolRotation
    )
}

/**
 * Rotates one screen-coordinate point around an origin using a KiCad angle.
 * @param {{ x: number, y: number }} point Point.
 * @param {{ x: number, y: number }} origin Rotation origin.
 * @param {number} rotation KiCad rotation.
 * @returns {{ x: number, y: number }}
 */
function rotatePoint(point, origin, rotation) {
    const radians = -(Number(rotation) || 0) * (Math.PI / 180)
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    const dx = point.x - origin.x
    const dy = point.y - origin.y
    return {
        x: origin.x + dx * cos - dy * sin,
        y: origin.y + dx * sin + dy * cos
    }
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
 * Mirrors KiCad's small stroke-font baseline adjustment.
 * @param {object} text Text item.
 * @returns {number}
 */
function textStrokeBaselineFudge(text) {
    return textStrokeWidth(text) * kicadStrokeBaselineFudgeRatio
}

/**
 * Mirrors KiCad's small stroke-font x adjustment for left and right text.
 * @param {object} text Text item.
 * @returns {number}
 */
function textStrokeHorizontalFudge(text) {
    return textStrokeWidth(text) / kicadStrokeHorizontalFudgeRatio
}

/**
 * Mirrors KiCad's local-label text clearance from the attached wire.
 * @param {object} text Render-ready text.
 * @returns {{ x: number, y: number }}
 */
function localLabelTextOffset(text) {
    const distance =
        textHeight(text) * kicadLocalLabelTextOffsetRatio +
        textStrokeWidth(text)
    if (isTextVertical(text.rotation)) return { x: -distance, y: 0 }
    return { x: 0, y: -distance }
}

/**
 * Checks whether a rendered text angle is vertical.
 * @param {number} rotation Rendered rotation.
 * @returns {boolean}
 */
function isTextVertical(rotation) {
    const normalized = Math.abs(Number(rotation || 0)) % 180
    return Math.abs(normalized - 90) < 0.001
}

/**
 * Resolves a positive KiCad stroke-font size.
 * @param {number | undefined} primary Primary value.
 * @param {number | undefined} secondary Secondary value.
 * @returns {number}
 */
function positiveTextSize(primary, secondary) {
    const value = Number(primary) || Number(secondary) || 1
    return Math.max(value, 0.001)
}
