// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const VALUE_FIELDS = Object.freeze({
    simple_capacitor: ['capacitance', 'display_capacitance'],
    simple_inductor: ['inductance', 'display_inductance'],
    simple_resistor: ['resistance', 'display_resistance']
})

/**
 * Completes inferred source-component variants with their required canonical
 * fields after all source ports have been projected.
 */
export class CircuitJsonSourceComponentCanonicalizer {
    /**
     * Normalizes source components in one owned CircuitJSON model.
     * @param {object[]} model Projected CircuitJSON elements.
     * @returns {void}
     */
    static normalize(model) {
        const portCounts =
            CircuitJsonSourceComponentCanonicalizer.#sourcePortCounts(model)
        for (const element of model) {
            if (element?.type !== 'source_component') continue
            CircuitJsonSourceComponentCanonicalizer.#normalizeComponent(
                element,
                portCounts.get(String(element.source_component_id || '')) || 0
            )
        }
    }

    /**
     * Counts unique projected source ports by component id.
     * @param {object[]} model Projected CircuitJSON elements.
     * @returns {Map<string, number>} Port counts by source component id.
     */
    static #sourcePortCounts(model) {
        const idsByComponent = new Map()
        for (const element of model) {
            if (element?.type !== 'source_port') continue
            const componentId = String(element.source_component_id || '')
            const portId = String(element.source_port_id || '')
            if (!componentId || !portId) continue
            const ids = idsByComponent.get(componentId) || new Set()
            ids.add(portId)
            idsByComponent.set(componentId, ids)
        }
        return new Map(
            [...idsByComponent].map(([componentId, ids]) => [
                componentId,
                ids.size
            ])
        )
    }

    /**
     * Completes or safely generalizes one inferred source-component variant.
     * @param {Record<string, any>} component Source component.
     * @param {number} sourcePortCount Projected unique source-port count.
     * @returns {void}
     */
    static #normalizeComponent(component, sourcePortCount) {
        const valueFields = VALUE_FIELDS[component.ftype]
        if (valueFields) {
            CircuitJsonSourceComponentCanonicalizer.#normalizeValueVariant(
                component,
                valueFields
            )
            return
        }
        if (component.ftype === 'simple_pin_header') {
            CircuitJsonSourceComponentCanonicalizer.#normalizePinHeader(
                component,
                sourcePortCount
            )
            return
        }
        if (component.ftype === 'simple_transistor') {
            CircuitJsonSourceComponentCanonicalizer.#normalizeTransistor(
                component
            )
        }
    }

    /**
     * Supplies the required SI value for a typed passive or falls back to a
     * generic chip when the source contains no value.
     * @param {Record<string, any>} component Source component.
     * @param {string[]} fields Required field followed by display aliases.
     * @returns {void}
     */
    static #normalizeValueVariant(component, fields) {
        const [requiredField, ...aliases] = fields
        const value = CircuitJsonSourceComponentCanonicalizer.#firstValue(
            component[requiredField],
            ...aliases.map((field) => component[field]),
            component.display_value
        )
        if (value !== undefined) {
            component[requiredField] = value
            return
        }
        component.ftype = 'simple_chip'
    }

    /**
     * Supplies a structurally derived pin count or retains connector semantics
     * without claiming an unavailable exact pin count.
     * @param {Record<string, any>} component Source component.
     * @param {number} sourcePortCount Projected unique source-port count.
     * @returns {void}
     */
    static #normalizePinHeader(component, sourcePortCount) {
        const explicit = Number(component.pin_count)
        const pinCount =
            Number.isSafeInteger(explicit) && explicit > 0
                ? explicit
                : sourcePortCount
        if (Number.isSafeInteger(pinCount) && pinCount > 0) {
            component.pin_count = pinCount
            return
        }
        component.ftype = 'simple_connector'
    }

    /**
     * Supplies the required transistor polarity when source metadata proves it
     * or falls back to the generic chip variant.
     * @param {Record<string, any>} component Source component.
     * @returns {void}
     */
    static #normalizeTransistor(component) {
        const explicit = String(component.transistor_type || '').toLowerCase()
        if (explicit === 'npn' || explicit === 'pnp') {
            component.transistor_type = explicit
            return
        }
        const metadata = [
            component.display_value,
            component.display_name,
            component.manufacturer_part_number,
            component.name
        ]
            .map((value) => String(value || '').toLowerCase())
            .join(' ')
        const inferred = /\bnpn\b/u.test(metadata)
            ? 'npn'
            : /\bpnp\b/u.test(metadata)
              ? 'pnp'
              : ''
        if (inferred) {
            component.transistor_type = inferred
            return
        }
        component.ftype = 'simple_chip'
    }

    /**
     * Returns the first non-empty string or finite numeric value.
     * @param {...unknown} values Candidate values.
     * @returns {string | number | undefined} Canonical value when available.
     */
    static #firstValue(...values) {
        for (const value of values) {
            if (typeof value === 'number' && Number.isFinite(value))
                return value
            if (typeof value !== 'string') continue
            const text = value.trim()
            if (text) return text
        }
        return undefined
    }
}

Object.freeze(CircuitJsonSourceComponentCanonicalizer.prototype)
Object.freeze(CircuitJsonSourceComponentCanonicalizer)
