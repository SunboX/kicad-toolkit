// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonModelAdapterPrimitives } from './CircuitJsonModelAdapterPrimitives.mjs'
import { CircuitJsonSchematicImageBuilder } from './CircuitJsonSchematicImageBuilder.mjs'

const Primitives = CircuitJsonModelAdapterPrimitives
const DEFAULT_INK = '#1f2430'

/** Projects KiCad text boxes, tables, sheets, and images to CircuitJSON. */
export class CircuitJsonSchematicDocumentGraphicsBuilder {
    /**
     * Appends document-layout graphics.
     * @param {object[]} circuitJson CircuitJSON target.
     * @param {Record<string, any>} schematic Native schematic model.
     * @param {string} idScope Stable id scope.
     * @param {{ componentIds?: Map<unknown, string> }} [context] Projection context.
     * @returns {{ assets: object[], diagnostics: object[] }} Image result.
     */
    static append(circuitJson, schematic, idScope, context = {}) {
        CircuitJsonSchematicDocumentGraphicsBuilder.#appendTextBoxes(
            circuitJson,
            schematic,
            idScope,
            context.componentIds
        )
        CircuitJsonSchematicDocumentGraphicsBuilder.#appendTables(
            circuitJson,
            schematic,
            idScope,
            context.componentIds
        )
        CircuitJsonSchematicDocumentGraphicsBuilder.#appendSheets(
            circuitJson,
            schematic,
            idScope
        )
        return CircuitJsonSchematicImageBuilder.append(
            circuitJson,
            schematic,
            idScope,
            context.componentIds
        )
    }

    /**
     * Appends text-box outlines and content.
     * @param {object[]} circuitJson CircuitJSON target.
     * @param {Record<string, any>} schematic Native schematic model.
     * @param {string} idScope Stable id scope.
     * @param {Map<unknown, string> | undefined} componentIds Component owners.
     * @returns {void}
     */
    static #appendTextBoxes(circuitJson, schematic, idScope, componentIds) {
        for (const [index, box] of Primitives.array(
            schematic.textBoxes
        ).entries()) {
            const x = Primitives.number(box.x, 0)
            const y = Primitives.number(box.y, 0)
            const width = Primitives.number(box.width, 0)
            const height = Primitives.number(box.height, 0)
            const ownership =
                CircuitJsonSchematicDocumentGraphicsBuilder.#ownership(
                    box,
                    componentIds
                )
            circuitJson.push(
                {
                    type: 'schematic_rect',
                    schematic_rect_id:
                        CircuitJsonSchematicDocumentGraphicsBuilder.#elementId(
                            idScope,
                            'schematic_text_box_outline',
                            box,
                            index
                        ),
                    center: Primitives.point(x + width / 2, y + height / 2),
                    width,
                    height,
                    rotation: Primitives.number(box.rotation, 0),
                    ...CircuitJsonSchematicDocumentGraphicsBuilder.#stroke(box),
                    ...CircuitJsonSchematicDocumentGraphicsBuilder.#fill(box),
                    ...ownership
                },
                {
                    type: 'schematic_text',
                    schematic_text_id:
                        CircuitJsonSchematicDocumentGraphicsBuilder.#elementId(
                            idScope,
                            'schematic_text_box_text',
                            box,
                            index
                        ),
                    text: Primitives.string(box.text || box.value, ''),
                    position:
                        CircuitJsonSchematicDocumentGraphicsBuilder.#boxTextPosition(
                            box
                        ),
                    anchor: CircuitJsonSchematicDocumentGraphicsBuilder.#textAnchor(
                        box
                    ),
                    font_size: Primitives.number(box.fontSize, 1.27),
                    rotation: Primitives.number(box.rotation, 0),
                    color: CircuitJsonSchematicDocumentGraphicsBuilder.#ink(
                        box
                    ),
                    ...ownership
                }
            )
        }
    }

    /**
     * Appends tables and cells.
     * @param {object[]} circuitJson CircuitJSON target.
     * @param {Record<string, any>} schematic Native schematic model.
     * @param {string} idScope Stable id scope.
     * @param {Map<unknown, string> | undefined} componentIds Component owners.
     * @returns {void}
     */
    static #appendTables(circuitJson, schematic, idScope, componentIds) {
        for (const [tableIndex, table] of Primitives.array(
            schematic.tables
        ).entries()) {
            const cells = Primitives.array(table.cells)
            const anchor =
                CircuitJsonSchematicDocumentGraphicsBuilder.#tableAnchor(cells)
            const tableId =
                CircuitJsonSchematicDocumentGraphicsBuilder.#elementId(
                    idScope,
                    'schematic_table',
                    table,
                    tableIndex
                )
            circuitJson.push({
                type: 'schematic_table',
                schematic_table_id: tableId,
                anchor_position: anchor,
                anchor: 'top_left',
                column_widths: Primitives.array(table.columnWidths).map(
                    (value) => Primitives.number(value, 0)
                ),
                row_heights: Primitives.array(table.rowHeights).map((value) =>
                    Primitives.number(value, 0)
                ),
                border_width: Math.max(
                    0,
                    ...cells.map((cell) => Primitives.number(cell.lineWidth, 0))
                ),
                ...CircuitJsonSchematicDocumentGraphicsBuilder.#ownership(
                    table,
                    componentIds
                )
            })
            for (const [cellIndex, cell] of cells.entries()) {
                const indices =
                    CircuitJsonSchematicDocumentGraphicsBuilder.#tableCellIndices(
                        table,
                        cell,
                        cellIndex,
                        anchor
                    )
                const width = Primitives.number(cell.width, 0)
                const height = Primitives.number(cell.height, 0)
                circuitJson.push({
                    type: 'schematic_table_cell',
                    schematic_table_cell_id:
                        CircuitJsonSchematicDocumentGraphicsBuilder.#elementId(
                            idScope,
                            'schematic_table_cell',
                            cell,
                            cellIndex
                        ),
                    schematic_table_id: tableId,
                    ...indices,
                    center: Primitives.point(
                        Primitives.number(cell.x, 0) + width / 2,
                        Primitives.number(cell.y, 0) + height / 2
                    ),
                    width,
                    height,
                    text: Primitives.string(cell.text || cell.value, ''),
                    font_size: Primitives.number(cell.fontSize, 1.27),
                    horizontal_align:
                        CircuitJsonSchematicDocumentGraphicsBuilder.#horizontalAlign(
                            cell
                        ),
                    vertical_align:
                        CircuitJsonSchematicDocumentGraphicsBuilder.#verticalAlign(
                            cell
                        )
                })
            }
        }
    }

    /**
     * Appends hierarchical sheets, outlines, labels, and entries.
     * @param {object[]} circuitJson CircuitJSON target.
     * @param {Record<string, any>} schematic Native schematic model.
     * @param {string} idScope Stable id scope.
     * @returns {void}
     */
    static #appendSheets(circuitJson, schematic, idScope) {
        const sheetSymbolIds = new Map()
        for (const [index, sheet] of Primitives.array(
            schematic.sheetSymbols
        ).entries()) {
            const sheetSymbolId =
                CircuitJsonSchematicDocumentGraphicsBuilder.#elementId(
                    idScope,
                    'schematic_sheet_symbol',
                    sheet,
                    index
                )
            sheetSymbolIds.set(String(sheet.ownerIndex || index), sheetSymbolId)
            const width = Primitives.number(sheet.width, 0)
            const height = Primitives.number(sheet.height, 0)
            const sourceFileName = Primitives.string(
                sheet.fileName || sheet.path,
                ''
            )
            circuitJson.push({
                type: 'schematic_sheet_symbol',
                schematic_sheet_symbol_id: sheetSymbolId,
                name: Primitives.string(
                    sheet.name,
                    'Sheet ' + String(index + 1)
                ),
                ...(sourceFileName ? { source_file_name: sourceFileName } : {}),
                center: Primitives.point(
                    Primitives.number(sheet.x, 0) + width / 2,
                    Primitives.number(sheet.y, 0) + height / 2
                ),
                width,
                height,
                render_order: Number.isSafeInteger(sheet.renderOrder)
                    ? sheet.renderOrder
                    : index,
                ...CircuitJsonSchematicDocumentGraphicsBuilder.#stroke(sheet),
                ...CircuitJsonSchematicDocumentGraphicsBuilder.#fill({
                    ...sheet,
                    fillColor:
                        sheet.fillColor ||
                        (/^(?:#|rgb)/iu.test(String(sheet.fill || ''))
                            ? sheet.fill
                            : '')
                })
            })
        }
        for (const [index, entry] of Primitives.array(
            schematic.sheetEntries
        ).entries()) {
            const sheetSymbolId = sheetSymbolIds.get(
                String(entry.ownerIndex || '')
            )
            if (!sheetSymbolId) continue
            const sourcePortId = Primitives.id(idScope, [
                'source_port',
                'sheet',
                entry.id || entry.name || index
            ])
            circuitJson.push(
                {
                    type: 'source_port',
                    source_port_id: sourcePortId,
                    name: Primitives.string(entry.name, `pin${index + 1}`),
                    pin_number: index + 1
                },
                {
                    type: 'schematic_port',
                    schematic_port_id: Primitives.id(idScope, [
                        'schematic_port',
                        'sheet',
                        entry.id || index
                    ]),
                    source_port_id: sourcePortId,
                    schematic_sheet_symbol_id: sheetSymbolId,
                    center: Primitives.point(entry.x, entry.y),
                    display_pin_label: Primitives.string(entry.name, ''),
                    side_of_component:
                        CircuitJsonSchematicDocumentGraphicsBuilder.#sheetSide(
                            entry.side
                        ),
                    facing_direction:
                        CircuitJsonSchematicDocumentGraphicsBuilder.#sheetFacing(
                            entry.side
                        ),
                    has_input_arrow: String(entry.kind) === 'input',
                    has_output_arrow: String(entry.kind) === 'output'
                }
            )
        }
    }

    /**
     * Builds a stable element id.
     * @param {string} idScope Stable id scope.
     * @param {string} family Element family.
     * @param {Record<string, any>} primitive Native primitive.
     * @param {number} index Primitive index.
     * @returns {string} Stable id.
     */
    static #elementId(idScope, family, primitive, index) {
        return Primitives.id(idScope, [
            family,
            primitive.uuid || primitive.id || primitive.ownerIndex || index
        ])
    }

    /**
     * Builds canonical stroke fields.
     * @param {Record<string, any>} primitive Native primitive.
     * @returns {object} Stroke fields.
     */
    static #stroke(primitive) {
        return {
            stroke_width: Primitives.number(
                primitive.lineWidth ?? primitive.width,
                0.15
            ),
            is_dashed:
                Boolean(primitive.dashed) ||
                !['', 'default', 'solid'].includes(
                    String(primitive.strokeStyle || '').toLowerCase()
                ),
            color: CircuitJsonSchematicDocumentGraphicsBuilder.#ink(primitive)
        }
    }

    /**
     * Builds canonical fill fields.
     * @param {Record<string, any>} primitive Native primitive.
     * @returns {object} Fill fields.
     */
    static #fill(primitive) {
        const fill = String(primitive.fill || '').toLowerCase()
        const isFilled = Boolean(primitive.isSolid) || (fill && fill !== 'none')
        const fillColor =
            primitive.fillColor ||
            (fill === 'outline'
                ? CircuitJsonSchematicDocumentGraphicsBuilder.#ink(primitive)
                : '')
        return {
            is_filled: isFilled,
            ...(fillColor ? { fill_color: String(fillColor) } : {})
        }
    }

    /**
     * Resolves a canonical ink color.
     * @param {Record<string, any>} primitive Native primitive.
     * @returns {string} CSS color.
     */
    static #ink(primitive) {
        return String(primitive.strokeColor || primitive.color || DEFAULT_INK)
    }

    /**
     * Resolves optional component ownership.
     * @param {Record<string, any>} primitive Native primitive.
     * @param {Map<unknown, string> | undefined} componentIds Component owners.
     * @returns {object} Ownership fields.
     */
    static #ownership(primitive, componentIds) {
        if (!(componentIds instanceof Map)) return {}
        for (const key of [
            primitive.ownerIndex,
            primitive.componentIndex,
            primitive.ownerId
        ]) {
            const id = componentIds.get(String(key ?? '').trim())
            if (id) return { schematic_component_id: id }
        }
        return {}
    }

    /**
     * Resolves a combined text anchor.
     * @param {Record<string, any>} text Native text.
     * @returns {string} Canonical anchor.
     */
    static #textAnchor(text) {
        const horizontal =
            CircuitJsonSchematicDocumentGraphicsBuilder.#horizontalAlign(text)
        const vertical =
            CircuitJsonSchematicDocumentGraphicsBuilder.#verticalAlign(text)
        const verticalPart = vertical === 'middle' ? 'center' : vertical
        const horizontalPart = horizontal === 'center' ? 'center' : horizontal
        if (verticalPart === 'center' && horizontalPart === 'center') {
            return 'center'
        }
        return `${verticalPart}_${horizontalPart}`
    }

    /**
     * Resolves horizontal alignment.
     * @param {Record<string, any>} value Native text-like row.
     * @returns {'left' | 'center' | 'right'} Alignment.
     */
    static #horizontalAlign(value) {
        const alignment = String(
            value.font?.hAlign || value.hAlign || 'left'
        ).toLowerCase()
        return ['left', 'center', 'right'].includes(alignment)
            ? alignment
            : 'left'
    }

    /**
     * Resolves vertical alignment.
     * @param {Record<string, any>} value Native text-like row.
     * @returns {'top' | 'middle' | 'bottom'} Alignment.
     */
    static #verticalAlign(value) {
        const alignment = String(
            value.font?.vAlign || value.vAlign || 'bottom'
        ).toLowerCase()
        if (alignment === 'center') return 'middle'
        return ['top', 'middle', 'bottom'].includes(alignment)
            ? alignment
            : 'bottom'
    }

    /**
     * Resolves a framed text position.
     * @param {Record<string, any>} box Native text box.
     * @returns {{ x: number, y: number }} Text position.
     */
    static #boxTextPosition(box) {
        const x = Primitives.number(box.x, 0)
        const y = Primitives.number(box.y, 0)
        const width = Primitives.number(box.width, 0)
        const height = Primitives.number(box.height, 0)
        const margins = box.margins || {}
        const horizontal =
            CircuitJsonSchematicDocumentGraphicsBuilder.#horizontalAlign(box)
        const vertical =
            CircuitJsonSchematicDocumentGraphicsBuilder.#verticalAlign(box)
        return Primitives.point(
            horizontal === 'right'
                ? x + width - Primitives.number(margins.right, 0)
                : horizontal === 'center'
                  ? x + width / 2
                  : x + Primitives.number(margins.left, 0),
            vertical === 'bottom'
                ? y + height - Primitives.number(margins.bottom, 0)
                : vertical === 'middle'
                  ? y + height / 2
                  : y + Primitives.number(margins.top, 0)
        )
    }

    /**
     * Resolves a table top-left anchor.
     * @param {object[]} cells Native table cells.
     * @returns {{ x: number, y: number }} Anchor.
     */
    static #tableAnchor(cells) {
        if (!cells.length) return { x: 0, y: 0 }
        return Primitives.point(
            Math.min(...cells.map((cell) => Primitives.number(cell.x, 0))),
            Math.min(...cells.map((cell) => Primitives.number(cell.y, 0)))
        )
    }

    /**
     * Resolves inclusive cell grid indices.
     * @param {Record<string, any>} table Native table.
     * @param {Record<string, any>} cell Native cell.
     * @param {number} cellIndex Cell index.
     * @param {{ x: number, y: number }} anchor Table anchor.
     * @returns {{ start_column_index: number, end_column_index: number, start_row_index: number, end_row_index: number }} Indices.
     */
    static #tableCellIndices(table, cell, cellIndex, anchor) {
        const columns = Math.max(
            1,
            Math.trunc(Primitives.number(table.columnCount, 1))
        )
        const columnStarts =
            CircuitJsonSchematicDocumentGraphicsBuilder.#cumulativeStarts(
                Primitives.array(table.columnWidths),
                anchor.x
            )
        const rowStarts =
            CircuitJsonSchematicDocumentGraphicsBuilder.#cumulativeStarts(
                Primitives.array(table.rowHeights),
                anchor.y
            )
        const startColumn =
            CircuitJsonSchematicDocumentGraphicsBuilder.#nearestIndex(
                columnStarts,
                Primitives.number(cell.x, anchor.x)
            ) ?? cellIndex % columns
        const startRow =
            CircuitJsonSchematicDocumentGraphicsBuilder.#nearestIndex(
                rowStarts,
                Primitives.number(cell.y, anchor.y)
            ) ?? Math.floor(cellIndex / columns)
        const columnSpan = Math.max(
            1,
            Math.trunc(Primitives.number(cell.colSpan, 1))
        )
        const rowSpan = Math.max(
            1,
            Math.trunc(Primitives.number(cell.rowSpan, 1))
        )
        return {
            start_column_index: startColumn,
            end_column_index: startColumn + columnSpan - 1,
            start_row_index: startRow,
            end_row_index: startRow + rowSpan - 1
        }
    }

    /**
     * Builds cumulative grid starts.
     * @param {unknown[]} sizes Row or column sizes.
     * @param {number} origin Grid origin.
     * @returns {number[]} Starts.
     */
    static #cumulativeStarts(sizes, origin) {
        const starts = []
        let cursor = origin
        for (const size of sizes) {
            starts.push(cursor)
            cursor += Primitives.number(size, 0)
        }
        return starts
    }

    /**
     * Finds an effectively equal grid coordinate.
     * @param {number[]} values Grid coordinates.
     * @param {number} target Source coordinate.
     * @returns {number | null} Index.
     */
    static #nearestIndex(values, target) {
        if (!values.length) return null
        let bestIndex = 0
        let bestDistance = Infinity
        values.forEach((value, index) => {
            const distance = Math.abs(value - target)
            if (distance < bestDistance) {
                bestDistance = distance
                bestIndex = index
            }
        })
        return bestDistance <= 0.001 ? bestIndex : null
    }

    /**
     * Normalizes one sheet side.
     * @param {unknown} value Native side.
     * @returns {'top' | 'bottom' | 'left' | 'right'} Side.
     */
    static #sheetSide(value) {
        const side = String(value || '').toLowerCase()
        return ['top', 'bottom', 'left', 'right'].includes(side) ? side : 'left'
    }

    /**
     * Resolves a sheet entry's inward facing direction.
     * @param {unknown} value Native side.
     * @returns {'up' | 'down' | 'left' | 'right'} Direction.
     */
    static #sheetFacing(value) {
        return {
            left: 'right',
            right: 'left',
            top: 'down',
            bottom: 'up'
        }[CircuitJsonSchematicDocumentGraphicsBuilder.#sheetSide(value)]
    }
}

Object.freeze(CircuitJsonSchematicDocumentGraphicsBuilder.prototype)
Object.freeze(CircuitJsonSchematicDocumentGraphicsBuilder)
