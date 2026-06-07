// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schematicRenderOpsSchema = 'kicad-toolkit.schematic.render-ops.a1'

/**
 * Builds deterministic schematic render-operation sidecars for KiCad SVGs.
 */
export class SchematicRenderOpsSidecarBuilder {
    /**
     * Returns the schematic render-operation schema id.
     * @returns {string}
     */
    static get schema() {
        return schematicRenderOpsSchema
    }

    /**
     * Builds a render-operation sidecar from a normalized schematic.
     * @param {object} schematic Schematic model.
     * @param {{ profile?: string }} [options] Sidecar options.
     * @returns {object}
     */
    static build(schematic, options = {}) {
        const records = [
            ...lineRecords(schematic?.lines || []),
            ...pinRecords(schematic?.pins || []),
            ...textRecords(schematic?.texts || [])
        ]

        return {
            schema: schematicRenderOpsSchema,
            profile: options.profile || 'kicad-default',
            coordinateSpace: {
                x: 'kicad-schematic',
                y: 'kicad-schematic',
                units: 'millimeters'
            },
            summary: {
                recordCount: records.length,
                operationCount: records.reduce(
                    (count, record) => count + record.operations.length,
                    0
                ),
                failedRecordCount: records.filter(
                    (record) => record.operations.length === 0
                ).length
            },
            records
        }
    }

    /**
     * Builds an escaped SVG metadata element containing the sidecar JSON.
     * @param {object} schematic Schematic model.
     * @param {{ profile?: string }} [options] Sidecar options.
     * @returns {string}
     */
    static metadataElement(schematic, options = {}) {
        return (
            '<metadata id="schematic-render-ops-metadata" data-schema="' +
            schematicRenderOpsSchema +
            '">' +
            escapeHtml(JSON.stringify(this.build(schematic, options))) +
            '</metadata>'
        )
    }
}

/**
 * Builds line primitive operation records.
 * @param {object[]} lines Line primitives.
 * @returns {object[]}
 */
function lineRecords(lines) {
    return lines.map((line, index) => ({
        elementKey: elementKey('line', index),
        recordId: recordId(line, 'line', index),
        primitive: 'line',
        operations: [
            {
                type: 'line',
                x1: numberOrUndefined(line?.x1),
                y1: numberOrUndefined(line?.y1),
                x2: numberOrUndefined(line?.x2),
                y2: numberOrUndefined(line?.y2),
                stroke: line?.stroke ?? line?.color,
                width: numberOrUndefined(line?.width ?? line?.strokeWidth),
                isBus: line?.isBus === true ? true : undefined
            }
        ]
    }))
}

/**
 * Builds pin primitive operation records.
 * @param {object[]} pins Pin primitives.
 * @returns {object[]}
 */
function pinRecords(pins) {
    return pins.map((pin, index) => ({
        elementKey: elementKey('pin', index),
        recordId: recordId(pin, 'pin', index),
        primitive: 'pin',
        operations: [
            {
                type: 'pin',
                x: numberOrUndefined(pin?.x),
                y: numberOrUndefined(pin?.y),
                length: numberOrUndefined(pin?.length),
                orientation: pin?.orientation,
                number: pin?.designator ?? pin?.number
            }
        ]
    }))
}

/**
 * Builds text primitive operation records.
 * @param {object[]} texts Text primitives.
 * @returns {object[]}
 */
function textRecords(texts) {
    return texts.map((text, index) => ({
        elementKey: elementKey('text', index),
        recordId: recordId(text, 'text', index),
        primitive: 'text',
        operations: [
            {
                type: 'stroke-text',
                x: numberOrUndefined(text?.x),
                y: numberOrUndefined(text?.y),
                text: text?.text ?? text?.value ?? '',
                fontSize: numberOrUndefined(textFontSize(text)),
                rotation: text?.rotation
            }
        ]
    }))
}

/**
 * Builds a stable SVG element key for a schematic primitive.
 * @param {string} kind Primitive kind.
 * @param {number} index Primitive index.
 * @returns {string}
 */
function elementKey(kind, index) {
    return 'schematic-' + kind + '-' + index
}

/**
 * Resolves a stable source record id.
 * @param {object} primitive Schematic primitive.
 * @param {string} kind Primitive kind.
 * @param {number} index Primitive index.
 * @returns {string}
 */
function recordId(primitive, kind, index) {
    return (
        primitive?.id ||
        primitive?.uuid ||
        primitive?.recordId ||
        elementKey(kind, index)
    )
}

/**
 * Resolves the text font size used by the stroke-text operation.
 * @param {object} text Text primitive.
 * @returns {number}
 */
function textFontSize(text) {
    return (
        text?.font?.height ??
        text?.font?.size ??
        text?.fontSize ??
        text?.sizeY ??
        text?.size ??
        1.27
    )
}

/**
 * Converts finite numeric values and leaves missing values undefined.
 * @param {unknown} value Raw value.
 * @returns {number | undefined}
 */
function numberOrUndefined(value) {
    const number = Number(value)
    return Number.isFinite(number) ? number : undefined
}

/**
 * Escapes SVG metadata text.
 * @param {unknown} value Raw value.
 * @returns {string}
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
}
