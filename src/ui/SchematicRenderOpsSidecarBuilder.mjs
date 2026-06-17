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
            ...textRecords(schematic?.texts || []),
            ...textBoxRecords(schematic?.textBoxes || []),
            ...tableCellRecords(schematic?.tables || []),
            ...sheetEntryRecords(schematic?.sheetEntries || []),
            ...imageRecords(schematic?.images || [])
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
 * Builds text-box operation records.
 * @param {object[]} textBoxes Text box primitives.
 * @returns {object[]}
 */
function textBoxRecords(textBoxes) {
    return textBoxes.map((textBox, index) =>
        frameTextRecord(textBox, 'text_box', 'text-box', index)
    )
}

/**
 * Builds table-cell operation records.
 * @param {object[]} tables Table primitives.
 * @returns {object[]}
 */
function tableCellRecords(tables) {
    return tables.flatMap((table, tableIndex) =>
        (table?.cells || []).map((cell, cellIndex) =>
            frameTextRecord(
                cell,
                'table_cell',
                'table-cell',
                tableIndex * 1000 + cellIndex
            )
        )
    )
}

/**
 * Builds hierarchical sheet-entry operation records.
 * @param {object[]} entries Sheet entry primitives.
 * @returns {object[]}
 */
function sheetEntryRecords(entries) {
    return entries.map((entry, index) => ({
        elementKey: elementKey('sheet-entry', index),
        recordId: recordId(entry, 'sheet-entry', index),
        primitive: 'sheet_entry',
        operations: [
            {
                type: 'sheet-entry-marker',
                x: numberOrUndefined(entry?.x),
                y: numberOrUndefined(entry?.y),
                side: entry?.side,
                kind: entry?.kind,
                ownerIndex: entry?.ownerIndex
            },
            {
                type: 'stroke-text',
                x: numberOrUndefined(entry?.x),
                y: numberOrUndefined(entry?.y),
                text: entry?.name ?? '',
                fontSize: numberOrUndefined(textFontSize(entry))
            }
        ]
    }))
}

/**
 * Builds schematic image operation records.
 * @param {object[]} images Image primitives.
 * @returns {object[]}
 */
function imageRecords(images) {
    return images.map((image, index) => ({
        elementKey: elementKey('image', index),
        recordId: recordId(image, 'image', index),
        primitive: 'image',
        operations: [
            {
                type: 'image',
                x: numberOrUndefined(image?.x),
                y: numberOrUndefined(image?.y),
                width: numberOrUndefined(image?.width),
                height: numberOrUndefined(image?.height),
                scale: numberOrUndefined(image?.scale),
                hasPayload: Boolean(normalizedPayload(image?.data)),
                nativeFormat: image?.format || image?.nativeFormat || undefined
            }
        ]
    }))
}

/**
 * Builds a frame object record with frame and stroke-text operations.
 * @param {object} frame Frame primitive.
 * @param {string} primitive Primitive type.
 * @param {string} keyKind Element-key kind.
 * @param {number} index Stable index.
 * @returns {object}
 */
function frameTextRecord(frame, primitive, keyKind, index) {
    return {
        elementKey: elementKey(keyKind, index),
        recordId: recordId(frame, keyKind, index),
        primitive,
        operations: [
            {
                type: 'frame',
                x: numberOrUndefined(frame?.x),
                y: numberOrUndefined(frame?.y),
                width: numberOrUndefined(frame?.width),
                height: numberOrUndefined(frame?.height),
                strokeWidth: numberOrUndefined(frame?.lineWidth),
                strokeStyle: frame?.strokeStyle,
                strokeColor: frame?.strokeColor,
                fill: frame?.fill,
                fillColor: frame?.fillColor,
                rotation: numberOrUndefined(frame?.rotation)
            },
            {
                type: 'stroke-text',
                x: numberOrUndefined(frame?.x),
                y: numberOrUndefined(frame?.y),
                text: frame?.text ?? frame?.value ?? '',
                fontSize: numberOrUndefined(textFontSize(frame)),
                rotation: numberOrUndefined(frame?.rotation)
            }
        ]
    }
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
 * Normalizes base64 payload text.
 * @param {unknown} value Payload text.
 * @returns {string}
 */
function normalizedPayload(value) {
    return String(value || '').replace(/\s+/gu, '')
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
