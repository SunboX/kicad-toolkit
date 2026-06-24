// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Infers Circuit JSON source component function types from generic metadata.
 */
export class CircuitJsonSourceComponentFtype {
    /**
     * Infers a component function type.
     * @param {Record<string, unknown>} component Component metadata.
     * @returns {string}
     */
    static infer(component) {
        const reference = String(
            component.designator || component.reference || component.name || ''
        ).toUpperCase()
        const text = CircuitJsonSourceComponentFtype.#metadataValues(component)
            .map((value) => String(value || '').toLowerCase())
            .join(' ')
        const referencePrefix = reference.match(/^[A-Z]+/u)?.[0] || ''

        if (referencePrefix.startsWith('FID') || /\bfiducial\b/u.test(text)) {
            return 'simple_fiducial'
        }
        if (referencePrefix === 'TP' || /\btest[\s_-]*point\b/u.test(text)) {
            return 'simple_test_point'
        }
        if (
            referencePrefix === 'SW' ||
            /\b(switch|button|push[\s_-]*button|tactile)\b/u.test(text)
        ) {
            return 'simple_switch'
        }
        if (referencePrefix === 'R' || /\bres(?:istor)?\b/u.test(text)) {
            return 'simple_resistor'
        }
        if (referencePrefix === 'C' || /\bcap(?:acitor)?\b/u.test(text)) {
            return 'simple_capacitor'
        }
        if (
            referencePrefix === 'L' ||
            /\b(inductor|coil|ferrite)\b/u.test(text)
        ) {
            return 'simple_inductor'
        }
        if (referencePrefix === 'LED' || /\bled\b/u.test(text)) {
            return 'simple_led'
        }
        if (referencePrefix === 'D' || /\bdiode\b/u.test(text)) {
            return 'simple_diode'
        }
        if (
            ['Q', 'T'].includes(referencePrefix) ||
            /\b(transistor|mosfet|fet|bjt)\b/u.test(text)
        ) {
            return 'simple_transistor'
        }
        if (
            ['J', 'P', 'CON', 'CN'].includes(referencePrefix) ||
            /\b(connector|header|socket|terminal)\b/u.test(text)
        ) {
            return 'simple_pin_header'
        }

        return 'simple_chip'
    }

    /**
     * Returns searchable metadata values for function inference.
     * @param {Record<string, unknown>} component Component metadata.
     * @returns {unknown[]}
     */
    static #metadataValues(component) {
        const properties =
            component.properties && typeof component.properties === 'object'
                ? Object.entries(component.properties).flat()
                : []
        const attributes = Array.isArray(component.attributes)
            ? component.attributes
            : []

        return [
            component.pattern,
            component.footprint,
            component.footprintName,
            component.value,
            component.comment,
            component.description,
            component.source,
            ...properties,
            ...attributes
        ]
    }
}
