// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonConformanceChecker } from './CircuitJsonConformanceChecker.mjs'
import { CircuitJsonModelAdapterPrimitives } from './CircuitJsonModelAdapterPrimitives.mjs'

const Primitives = CircuitJsonModelAdapterPrimitives

/**
 * Serializes conversion diagnostics and aggregate statistics into metadata.
 */
export class CircuitJsonProjectMetadataBuilder {
    /**
     * Finalizes project metadata after all Circuit JSON elements are appended.
     * @param {Record<string, unknown>} projectMetadata Project metadata element.
     * @param {object[]} circuitJson Circuit JSON element array.
     * @param {Record<string, unknown>} model Renderer model.
     * @returns {void}
     */
    static finalize(projectMetadata, circuitJson, model) {
        const conformance = CircuitJsonConformanceChecker.check(circuitJson)

        projectMetadata.conversion_stats = {
            summary: CircuitJsonProjectMetadataBuilder.#summary(model),
            elements:
                CircuitJsonProjectMetadataBuilder.#elementCounts(circuitJson),
            conformance: {
                valid: conformance.valid,
                errorCount: conformance.errorCount,
                checkedReferenceCount: conformance.checkedReferenceCount
            }
        }

        const diagnostics =
            CircuitJsonProjectMetadataBuilder.#diagnostics(model)
        if (diagnostics.length > 0) {
            projectMetadata.diagnostics = diagnostics
        }
        if (conformance.diagnostics.length > 0) {
            projectMetadata.conformance_diagnostics =
                conformance.diagnostics.map((diagnostic) => ({
                    ...diagnostic
                }))
        }
    }

    /**
     * Builds a stable conversion summary from renderer model totals.
     * @param {Record<string, unknown>} model Renderer model.
     * @returns {Record<string, unknown>}
     */
    static #summary(model) {
        const summary = { ...(model.summary || {}) }
        const pcb = model.pcb || {}
        const schematic = model.schematic || {}
        const pcbLibrary = model.pcbLibrary || {}
        const schematicLibrary = model.schematicLibrary || {}

        CircuitJsonProjectMetadataBuilder.#setCount(
            summary,
            'componentCount',
            Primitives.array(pcb.components).length +
                Primitives.array(schematic.components).length
        )
        CircuitJsonProjectMetadataBuilder.#setCount(
            summary,
            'padCount',
            Primitives.array(pcb.pads).length
        )
        CircuitJsonProjectMetadataBuilder.#setCount(
            summary,
            'viaCount',
            Primitives.array(pcb.vias).length
        )
        CircuitJsonProjectMetadataBuilder.#setCount(
            summary,
            'trackCount',
            Primitives.array(pcb.tracks).length
        )
        CircuitJsonProjectMetadataBuilder.#setCount(
            summary,
            'netCount',
            Primitives.array(pcb.nets).length +
                Primitives.array(schematic.nets).length
        )
        CircuitJsonProjectMetadataBuilder.#setCount(
            summary,
            'pinCount',
            Primitives.array(schematic.pins).length
        )
        CircuitJsonProjectMetadataBuilder.#setCount(
            summary,
            'footprintCount',
            Primitives.array(pcbLibrary.footprints).length
        )
        CircuitJsonProjectMetadataBuilder.#setCount(
            summary,
            'symbolCount',
            Primitives.array(schematicLibrary.symbols).length
        )

        return summary
    }

    /**
     * Sets a summary count when the source model exposes matching content.
     * @param {Record<string, unknown>} summary Summary object.
     * @param {string} key Summary field name.
     * @param {number} count Derived count.
     * @returns {void}
     */
    static #setCount(summary, key, count) {
        if (summary[key] === undefined && count > 0) summary[key] = count
    }

    /**
     * Counts Circuit JSON elements by type.
     * @param {object[]} circuitJson Circuit JSON element array.
     * @returns {Record<string, number>}
     */
    static #elementCounts(circuitJson) {
        return circuitJson.reduce((counts, element) => {
            const type = String(element.type || '').trim()
            if (!type) return counts
            counts[type] = (counts[type] || 0) + 1
            return counts
        }, {})
    }

    /**
     * Returns serializable parser diagnostics.
     * @param {Record<string, unknown>} model Renderer model.
     * @returns {object[]}
     */
    static #diagnostics(model) {
        return Primitives.array(model.diagnostics).map((diagnostic) => {
            if (diagnostic && typeof diagnostic === 'object') {
                return { ...diagnostic }
            }

            return { message: Primitives.string(diagnostic, 'Diagnostic') }
        })
    }
}
