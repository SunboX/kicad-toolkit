// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

const PRIMARY_ID_FIELDS = {
    source_component: 'source_component_id',
    source_net: 'source_net_id',
    source_port: 'source_port_id',
    source_project_metadata: null,
    source_trace: 'source_trace_id',
    pcb_board: 'pcb_board_id',
    pcb_component: 'pcb_component_id',
    pcb_copper_pour: 'pcb_copper_pour_id',
    pcb_courtyard: 'pcb_courtyard_id',
    pcb_courtyard_circle: 'pcb_courtyard_circle_id',
    pcb_courtyard_line: 'pcb_courtyard_line_id',
    pcb_courtyard_outline: 'pcb_courtyard_outline_id',
    pcb_courtyard_path: 'pcb_courtyard_path_id',
    pcb_courtyard_rect: 'pcb_courtyard_rect_id',
    pcb_cutout: 'pcb_cutout_id',
    pcb_fabrication_note_line: 'pcb_fabrication_note_line_id',
    pcb_fabrication_note_path: 'pcb_fabrication_note_path_id',
    pcb_fabrication_note_text: 'pcb_fabrication_note_text_id',
    pcb_hole: 'pcb_hole_id',
    pcb_plated_hole: 'pcb_plated_hole_id',
    pcb_port: 'pcb_port_id',
    pcb_silkscreen_line: 'pcb_silkscreen_line_id',
    pcb_silkscreen_path: 'pcb_silkscreen_path_id',
    pcb_silkscreen_text: 'pcb_silkscreen_text_id',
    pcb_smtpad: 'pcb_smtpad_id',
    pcb_text: 'pcb_text_id',
    pcb_trace: 'pcb_trace_id',
    pcb_via: 'pcb_via_id',
    schematic_arc: 'schematic_arc_id',
    schematic_component: 'schematic_component_id',
    schematic_line: 'schematic_line_id',
    schematic_net_label: 'schematic_net_label_id',
    schematic_port: 'schematic_port_id',
    schematic_rect: 'schematic_rect_id',
    schematic_text: 'schematic_text_id',
    schematic_trace: 'schematic_trace_id'
}

/**
 * Validates internal Circuit JSON ids and references emitted by the adapter.
 */
export class CircuitJsonConformanceChecker {
    /**
     * Returns a conformance report for a Circuit JSON element array.
     * @param {unknown} circuitJson Candidate Circuit JSON element array.
     * @returns {{ valid: boolean, errorCount: number, checkedReferenceCount: number, diagnostics: object[] }}
     */
    static check(circuitJson) {
        const elements = Array.isArray(circuitJson) ? circuitJson : []
        const context = CircuitJsonConformanceChecker.#context(elements)

        for (const element of elements) {
            CircuitJsonConformanceChecker.#checkElementReferences(
                context,
                element
            )
        }

        return {
            valid: context.diagnostics.length === 0,
            errorCount: context.diagnostics.length,
            checkedReferenceCount: context.checkedReferenceCount,
            diagnostics: context.diagnostics
        }
    }

    /**
     * Builds reusable validation indexes.
     * @param {object[]} elements Circuit JSON elements.
     * @returns {{ checkedReferenceCount: number, diagnostics: object[], elementIds: Map<string, object>, pcbPortIds: Set<string>, sourceNetIds: Set<string>, sourcePortIds: Set<string>, sourceTraceIds: Set<string> }}
     */
    static #context(elements) {
        const context = {
            checkedReferenceCount: 0,
            diagnostics: [],
            elementIds: new Map(),
            pcbPortIds: new Set(),
            sourceNetIds: new Set(),
            sourcePortIds: new Set(),
            sourceTraceIds: new Set()
        }

        for (const element of elements) {
            CircuitJsonConformanceChecker.#indexElement(context, element)
        }

        return context
    }

    /**
     * Adds one element's primary id to validation indexes.
     * @param {object} context Validation context.
     * @param {object} element Circuit JSON element.
     * @returns {void}
     */
    static #indexElement(context, element) {
        const primaryId = CircuitJsonConformanceChecker.#primaryId(element)
        if (primaryId) {
            CircuitJsonConformanceChecker.#indexPrimaryId(
                context,
                element,
                primaryId
            )
        }

        if (element.type === 'source_net') {
            context.sourceNetIds.add(String(element.source_net_id || ''))
        }
        if (element.type === 'source_port') {
            context.sourcePortIds.add(String(element.source_port_id || ''))
        }
        if (element.type === 'source_trace') {
            context.sourceTraceIds.add(String(element.source_trace_id || ''))
        }
        if (element.type === 'pcb_port') {
            context.pcbPortIds.add(String(element.pcb_port_id || ''))
        }
    }

    /**
     * Adds one primary id and records duplicates as conformance errors.
     * @param {object} context Validation context.
     * @param {object} element Circuit JSON element.
     * @param {string} primaryId Element primary id.
     * @returns {void}
     */
    static #indexPrimaryId(context, element, primaryId) {
        if (!context.elementIds.has(primaryId)) {
            context.elementIds.set(primaryId, element)
            return
        }

        CircuitJsonConformanceChecker.#addDiagnostic(context, element, {
            code: 'duplicate_element_id',
            field: CircuitJsonConformanceChecker.#primaryIdField(element),
            reference: primaryId
        })
    }

    /**
     * Checks all references owned by one element.
     * @param {object} context Validation context.
     * @param {object} element Circuit JSON element.
     * @returns {void}
     */
    static #checkElementReferences(context, element) {
        CircuitJsonConformanceChecker.#checkFieldReference(
            context,
            element,
            'source_net_id',
            context.sourceNetIds,
            'missing_source_net'
        )
        CircuitJsonConformanceChecker.#checkFieldReference(
            context,
            element,
            'source_port_id',
            context.sourcePortIds,
            'missing_source_port'
        )
        CircuitJsonConformanceChecker.#checkFieldReference(
            context,
            element,
            'source_trace_id',
            context.sourceTraceIds,
            'missing_source_trace'
        )
        CircuitJsonConformanceChecker.#checkFieldReference(
            context,
            element,
            'pcb_port_id',
            context.pcbPortIds,
            'missing_pcb_port'
        )
        CircuitJsonConformanceChecker.#checkArrayReferences(
            context,
            element,
            'connected_source_net_ids',
            context.sourceNetIds,
            'missing_source_net'
        )
        CircuitJsonConformanceChecker.#checkArrayReferences(
            context,
            element,
            'connected_source_port_ids',
            context.sourcePortIds,
            'missing_source_port'
        )
        CircuitJsonConformanceChecker.#checkRouteReferences(context, element)
    }

    /**
     * Checks one scalar reference field when it is not the element primary id.
     * @param {object} context Validation context.
     * @param {object} element Circuit JSON element.
     * @param {string} field Field name.
     * @param {Set<string>} targets Valid target ids.
     * @param {string} code Diagnostic code.
     * @returns {void}
     */
    static #checkFieldReference(context, element, field, targets, code) {
        if (CircuitJsonConformanceChecker.#primaryIdField(element) === field) {
            return
        }
        const value = String(element[field] || '').trim()
        if (!value) return

        context.checkedReferenceCount += 1
        if (!targets.has(value)) {
            CircuitJsonConformanceChecker.#addDiagnostic(context, element, {
                code,
                field,
                reference: value
            })
        }
    }

    /**
     * Checks an array reference field.
     * @param {object} context Validation context.
     * @param {object} element Circuit JSON element.
     * @param {string} field Field name.
     * @param {Set<string>} targets Valid target ids.
     * @param {string} code Diagnostic code.
     * @returns {void}
     */
    static #checkArrayReferences(context, element, field, targets, code) {
        if (!Array.isArray(element[field])) return

        for (const reference of element[field]) {
            const value = String(reference || '').trim()
            if (!value) continue

            context.checkedReferenceCount += 1
            if (!targets.has(value)) {
                CircuitJsonConformanceChecker.#addDiagnostic(context, element, {
                    code,
                    field,
                    reference: value
                })
            }
        }
    }

    /**
     * Checks PCB trace route endpoint references.
     * @param {object} context Validation context.
     * @param {object} element Circuit JSON element.
     * @returns {void}
     */
    static #checkRouteReferences(context, element) {
        if (!Array.isArray(element.route)) return

        for (const routePoint of element.route) {
            for (const field of ['start_pcb_port_id', 'end_pcb_port_id']) {
                const value = String(routePoint[field] || '').trim()
                if (!value) continue

                context.checkedReferenceCount += 1
                if (!context.pcbPortIds.has(value)) {
                    CircuitJsonConformanceChecker.#addDiagnostic(
                        context,
                        element,
                        {
                            code: 'missing_pcb_port',
                            field: `route.${field}`,
                            reference: value
                        }
                    )
                }
            }
        }
    }

    /**
     * Adds a normalized conformance diagnostic.
     * @param {object} context Validation context.
     * @param {object} element Circuit JSON element.
     * @param {{ code: string, field: string, reference: string }} diagnostic Diagnostic detail.
     * @returns {void}
     */
    static #addDiagnostic(context, element, diagnostic) {
        context.diagnostics.push({
            severity: 'error',
            code: diagnostic.code,
            element_type: String(element.type || ''),
            element_id:
                CircuitJsonConformanceChecker.#primaryId(element) || null,
            field: diagnostic.field,
            reference: diagnostic.reference
        })
    }

    /**
     * Returns one element's primary id value.
     * @param {object} element Circuit JSON element.
     * @returns {string}
     */
    static #primaryId(element) {
        const field = CircuitJsonConformanceChecker.#primaryIdField(element)
        return field ? String(element[field] || '').trim() : ''
    }

    /**
     * Returns one element's primary id field name.
     * @param {object} element Circuit JSON element.
     * @returns {string | null}
     */
    static #primaryIdField(element) {
        const type = String(element.type || '')
        if (Object.hasOwn(PRIMARY_ID_FIELDS, type)) {
            return PRIMARY_ID_FIELDS[type]
        }

        const inferredField = `${type}_id`
        return Object.hasOwn(element, inferredField) ? inferredField : null
    }
}
