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
     * @returns {void}
     */
    static append(circuitJson, idScope, texts) {
        for (const [textIndex, text] of Primitives.array(texts).entries()) {
            CircuitJsonPcbTextBuilder.#appendText(
                circuitJson,
                idScope,
                text,
                textIndex
            )
        }
    }

    /**
     * Appends one PCB text element.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} text Parsed PCB text row.
     * @param {number} textIndex Text index.
     * @returns {void}
     */
    static #appendText(circuitJson, idScope, text, textIndex) {
        const textValue = Primitives.string(text.text || text.value, '')
        if (!textValue) return

        const type = CircuitJsonPcbTextBuilder.#textType(text)
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
            layer: Primitives.pcbTextLayer(text),
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

        circuitJson.push(element)
    }

    /**
     * Returns the Circuit JSON type for one PCB text primitive.
     * @param {Record<string, unknown>} text PCB text primitive.
     * @returns {string}
     */
    static #textType(text) {
        if (Primitives.isPcbSilkscreenText(text)) return 'pcb_silkscreen_text'
        if (Primitives.isPcbFabricationText(text)) {
            return 'pcb_fabrication_note_text'
        }
        return 'pcb_text'
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
        return 'pcb_text_id'
    }
}
