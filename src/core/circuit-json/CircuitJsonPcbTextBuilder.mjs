// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonModelAdapterPrimitives } from './CircuitJsonModelAdapterPrimitives.mjs'

const Primitives = CircuitJsonModelAdapterPrimitives

/**
 * Builds Circuit JSON PCB text elements from parsed board text rows.
 */
export class CircuitJsonPcbTextBuilder {
    /**
     * Appends PCB text elements.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {string} idScope Deterministic id scope.
     * @param {unknown[]} texts Parsed PCB text rows.
     * @param {{ ownerComponentIds?: Map<string, string> }} [options] Builder options.
     * @returns {void}
     */
    static append(circuitJson, idScope, texts, options = {}) {
        for (const [textIndex, text] of Primitives.array(texts).entries()) {
            CircuitJsonPcbTextBuilder.#appendText(
                circuitJson,
                idScope,
                text,
                textIndex,
                options
            )
        }
    }

    /**
     * Appends one PCB text element.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} text Parsed PCB text row.
     * @param {number} textIndex Text index.
     * @param {{ ownerComponentIds?: Map<string, string> }} options Builder options.
     * @returns {void}
     */
    static #appendText(circuitJson, idScope, text, textIndex, options) {
        const textValue = Primitives.string(text.text || text.value, '')
        if (!textValue) return

        const ownerComponentId = CircuitJsonPcbTextBuilder.#ownerComponentId(
            text,
            options.ownerComponentIds
        )
        const type = CircuitJsonPcbTextBuilder.#textType(text, ownerComponentId)
        const idField = CircuitJsonPcbTextBuilder.#textIdField(type)
        const position = Primitives.milPoint(text.x, text.y)
        const element = {
            type,
            [idField]: Primitives.id(idScope, [
                type,
                text.id || text.uuid || textIndex
            ]),
            text: textValue,
            x: position.x,
            y: position.y,
            anchor_position: position,
            layer: CircuitJsonPcbTextBuilder.#side(text),
            ccw_rotation: Primitives.normalizedRotation(text.rotation),
            font_size: Primitives.pcbTextFontSize(text),
            is_hidden: Primitives.isHiddenText(text)
        }
        const strokeWidth = Primitives.pcbTextStrokeWidth(text)
        const sourceTextKind = Primitives.string(
            text.textKind || text.sourceType || text.propertyName || text.kind,
            ''
        )

        if (strokeWidth !== undefined) element.stroke_width = strokeWidth
        if (sourceTextKind) element.source_text_kind = sourceTextKind
        if (ownerComponentId) element.pcb_component_id = ownerComponentId

        circuitJson.push(element)
    }

    /**
     * Returns the Circuit JSON type for one PCB text primitive.
     * @param {Record<string, unknown>} text PCB text primitive.
     * @param {string} ownerComponentId Owning PCB component id.
     * @returns {string}
     */
    static #textType(text, ownerComponentId) {
        if (ownerComponentId && Primitives.isPcbSilkscreenText(text)) {
            return 'pcb_silkscreen_text'
        }
        if (ownerComponentId && Primitives.isPcbFabricationText(text)) {
            return 'pcb_fabrication_note_text'
        }
        return 'pcb_note_text'
    }

    /**
     * Returns the primary id field for one PCB text element type.
     * @param {string} type Circuit JSON text element type.
     * @returns {string}
     */
    static #textIdField(type) {
        if (type === 'pcb_silkscreen_text') return 'pcb_silkscreen_text_id'
        if (type === 'pcb_fabrication_note_text') {
            return 'pcb_fabrication_note_text_id'
        }
        return 'pcb_note_text_id'
    }

    /**
     * Resolves the owning PCB component for footprint text.
     * @param {Record<string, unknown>} text Parsed PCB text row.
     * @param {Map<string, string> | undefined} ownerComponentIds Owner lookup.
     * @returns {string} Owning PCB component id.
     */
    static #ownerComponentId(text, ownerComponentIds) {
        if (!ownerComponentIds) return ''
        for (const key of [
            text.ownerId,
            text.footprintId,
            text.footprintReference,
            text.ownerIndex
        ]) {
            const value = String(key || '').trim()
            if (value && ownerComponentIds.has(value)) {
                return ownerComponentIds.get(value)
            }
        }
        return ''
    }

    /**
     * Returns the canonical top or bottom side for PCB text.
     * @param {Record<string, unknown>} text Parsed PCB text row.
     * @returns {'top' | 'bottom'} Canonical side.
     */
    static #side(text) {
        const layer = String(text.layer || '').toLowerCase()
        return layer.includes('bottom') || layer.startsWith('b.')
            ? 'bottom'
            : 'top'
    }
}
