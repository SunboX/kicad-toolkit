// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const milsPerMillimeter = 1000 / 25.4

/**
 * Resolves KiCad PCB text-box metadata for 3D scene consumers.
 */
export class PcbScene3dTextBoxLayoutResolver {
    /**
     * Resolves one KiCad text-box primitive into renderable dimensions.
     * @param {{ sourceType?: string, textBox?: object, hAlign?: string, vAlign?: string }} text Text row.
     * @returns {{ source: string, mode: string, border: boolean, widthMil: number, heightMil: number, marginMil: object, renderWidthMil: number, renderHeightMil: number, justification: object } | null}
     */
    static resolve(text) {
        const textBox = text?.textBox
        const boxSize = sizeFor(textBox)
        const width = millimetersToMils(boxSize.width)
        const height = millimetersToMils(boxSize.height)

        if (
            !textBox ||
            !String(text?.sourceType || textBox.sourceType || '').endsWith(
                'text_box'
            ) ||
            width <= 0 ||
            height <= 0
        ) {
            return null
        }

        const margin = margins(textBox.margins)

        return {
            source: 'kicad-textbox',
            mode: modeFor(textBox),
            border: textBox.border !== false,
            widthMil: width,
            heightMil: height,
            marginMil: margin,
            renderWidthMil: width + margin.left + margin.right,
            renderHeightMil: height + margin.top + margin.bottom,
            justification: justification(text)
        }
    }
}

/**
 * Resolves the text-box shape mode.
 * @param {object} textBox Text-box metadata.
 * @returns {string}
 */
function modeFor(textBox) {
    if (textBox?.shape) return String(textBox.shape)
    return Array.isArray(textBox?.points) && textBox.points.length > 0
        ? 'polygon'
        : 'rect'
}

/**
 * Resolves text-box size from explicit dimensions or point bounds.
 * @param {object | undefined} textBox Text-box metadata.
 * @returns {{ width: number, height: number }}
 */
function sizeFor(textBox) {
    const width = Number(textBox?.width)
    const height = Number(textBox?.height)
    if (Number.isFinite(width) && Number.isFinite(height)) {
        return { width, height }
    }

    return pointBounds(textBox?.points)
}

/**
 * Computes point bounds in millimeters.
 * @param {{ x?: number, y?: number }[] | undefined} points Point list.
 * @returns {{ width: number, height: number }}
 */
function pointBounds(points) {
    const xs = (points || []).map((point) => Number(point.x || 0))
    const ys = (points || []).map((point) => Number(point.y || 0))
    if (xs.length === 0 || ys.length === 0) return { width: 0, height: 0 }
    return {
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys)
    }
}

/**
 * Converts millimeters to mils.
 * @param {unknown} value Millimeter value.
 * @returns {number}
 */
function millimetersToMils(value) {
    const number = Number(value)
    return Number.isFinite(number) ? number * milsPerMillimeter : 0
}

/**
 * Resolves text-box margins in mils.
 * @param {object | undefined} value Margin values in millimeters.
 * @returns {{ left: number, top: number, right: number, bottom: number }}
 */
function margins(value) {
    return {
        left: millimetersToMils(value?.left),
        top: millimetersToMils(value?.top),
        right: millimetersToMils(value?.right),
        bottom: millimetersToMils(value?.bottom)
    }
}

/**
 * Resolves KiCad text alignment into a three-by-three matrix position.
 * @param {{ hAlign?: string, vAlign?: string }} text Text row.
 * @returns {{ column: number, row: number }}
 */
function justification(text) {
    return {
        column: alignmentIndex(text?.hAlign, ['left', 'center', 'right'], 1),
        row: alignmentIndex(text?.vAlign, ['top', 'center', 'bottom'], 1)
    }
}

/**
 * Converts an alignment string to its matrix index.
 * @param {unknown} value Alignment value.
 * @param {string[]} choices Ordered alignment choices.
 * @param {number} fallback Fallback index.
 * @returns {number}
 */
function alignmentIndex(value, choices, fallback) {
    const index = choices.indexOf(String(value || '').toLowerCase())
    return index >= 0 ? index : fallback
}
