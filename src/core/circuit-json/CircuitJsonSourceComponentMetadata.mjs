// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Extracts Circuit JSON source component metadata from generic component fields.
 */
export class CircuitJsonSourceComponentMetadata {
    /**
     * Returns optional source component metadata fields.
     * @param {Record<string, unknown>} component Component metadata.
     * @returns {Record<string, unknown>}
     */
    static fields(component) {
        const fields = {}
        const manufacturerPartNumber =
            CircuitJsonSourceComponentMetadata.manufacturerPartNumber(component)
        const supplierPartNumbers =
            CircuitJsonSourceComponentMetadata.supplierPartNumbers(component)

        if (manufacturerPartNumber) {
            fields.manufacturer_part_number = manufacturerPartNumber
        }
        if (Object.keys(supplierPartNumbers).length > 0) {
            fields.supplier_part_numbers = supplierPartNumbers
        }

        return fields
    }

    /**
     * Returns a manufacturer part number from common component metadata fields.
     * @param {Record<string, unknown>} component Component metadata.
     * @returns {string}
     */
    static manufacturerPartNumber(component) {
        const explicit =
            CircuitJsonSourceComponentMetadata.#firstText(
                component.manufacturer_part_number,
                component.manufacturerPartNumber,
                component.mpn
            ) || ''

        if (explicit) return explicit

        for (const [name, value] of Object.entries(
            CircuitJsonSourceComponentMetadata.#properties(component)
        )) {
            if (
                CircuitJsonSourceComponentMetadata.#isManufacturerPartProperty(
                    name
                )
            ) {
                return CircuitJsonSourceComponentMetadata.#firstText(value)
            }
        }

        return ''
    }

    /**
     * Returns supplier part numbers grouped by normalized supplier key.
     * @param {Record<string, unknown>} component Component metadata.
     * @returns {Record<string, string[]>}
     */
    static supplierPartNumbers(component) {
        const supplierPartNumbers = {}
        CircuitJsonSourceComponentMetadata.#mergeSupplierPartNumbers(
            supplierPartNumbers,
            CircuitJsonSourceComponentMetadata.#supplierObject(
                component.supplier_part_numbers
            )
        )
        CircuitJsonSourceComponentMetadata.#mergeSupplierPartNumbers(
            supplierPartNumbers,
            CircuitJsonSourceComponentMetadata.#supplierObject(
                component.supplierPartNumbers
            )
        )

        for (const [name, value] of Object.entries(
            CircuitJsonSourceComponentMetadata.#properties(component)
        )) {
            if (
                !CircuitJsonSourceComponentMetadata.#isSupplierPartProperty(
                    name
                )
            ) {
                continue
            }

            const supplierKey =
                CircuitJsonSourceComponentMetadata.#supplierKey(name)
            const partNumbers =
                CircuitJsonSourceComponentMetadata.#partNumbers(value)

            if (partNumbers.length === 0) continue
            CircuitJsonSourceComponentMetadata.#appendSupplierPartNumbers(
                supplierPartNumbers,
                supplierKey,
                partNumbers
            )
        }

        return supplierPartNumbers
    }

    /**
     * Returns a plain property map from one component.
     * @param {Record<string, unknown>} component Component metadata.
     * @returns {Record<string, unknown>}
     */
    static #properties(component) {
        return CircuitJsonSourceComponentMetadata.#isPlainObject(
            component.properties
        )
            ? component.properties
            : {}
    }

    /**
     * Returns a normalized supplier part-number object.
     * @param {unknown} value Candidate supplier object.
     * @returns {Record<string, string[]>}
     */
    static #supplierObject(value) {
        if (!CircuitJsonSourceComponentMetadata.#isPlainObject(value)) {
            return {}
        }

        const supplierPartNumbers = {}
        for (const [name, partNumberValue] of Object.entries(value)) {
            const supplierKey =
                CircuitJsonSourceComponentMetadata.#supplierKey(name)
            const partNumbers =
                CircuitJsonSourceComponentMetadata.#partNumbers(partNumberValue)

            if (partNumbers.length === 0) continue
            supplierPartNumbers[supplierKey] = partNumbers
        }

        return supplierPartNumbers
    }

    /**
     * Merges supplier part-number maps.
     * @param {Record<string, string[]>} target Target map.
     * @param {Record<string, string[]>} source Source map.
     * @returns {void}
     */
    static #mergeSupplierPartNumbers(target, source) {
        for (const [supplierKey, partNumbers] of Object.entries(source)) {
            CircuitJsonSourceComponentMetadata.#appendSupplierPartNumbers(
                target,
                supplierKey,
                partNumbers
            )
        }
    }

    /**
     * Appends unique supplier part numbers.
     * @param {Record<string, string[]>} target Target map.
     * @param {string} supplierKey Supplier key.
     * @param {string[]} partNumbers Part numbers.
     * @returns {void}
     */
    static #appendSupplierPartNumbers(target, supplierKey, partNumbers) {
        const existing = target[supplierKey] || []
        target[supplierKey] = [...new Set([...existing, ...partNumbers])]
    }

    /**
     * Returns true when a property name describes a manufacturer part number.
     * @param {unknown} name Property name.
     * @returns {boolean}
     */
    static #isManufacturerPartProperty(name) {
        const normalized = String(name || '').toLowerCase()

        if (normalized === 'mpn') return true

        return (
            /\b(manufacturer|mfr|maker)\b/u.test(normalized) &&
            /\b(part|number|no|pn)\b|#/u.test(normalized)
        )
    }

    /**
     * Returns true when a property name describes supplier part numbers.
     * @param {unknown} name Property name.
     * @returns {boolean}
     */
    static #isSupplierPartProperty(name) {
        const normalized = String(name || '').toLowerCase()

        if (
            CircuitJsonSourceComponentMetadata.#isManufacturerPartProperty(
                normalized
            )
        ) {
            return false
        }

        return (
            /\b(supplier|supply|distributor|vendor|source)\b/u.test(
                normalized
            ) && /\b(part|number|no|pn)\b|#/u.test(normalized)
        )
    }

    /**
     * Normalizes a supplier property name to a stable object key.
     * @param {unknown} name Supplier name or property label.
     * @returns {string}
     */
    static #supplierKey(name) {
        const normalized = String(name || '')
            .toLowerCase()
            .replace(/\bpart\s*(?:number|no|#)?\b/gu, ' ')
            .replace(/\b(?:number|no|pn)\b/gu, ' ')
            .replace(/#/gu, ' ')
            .replace(/[^a-z0-9]+/gu, '_')
            .replace(/^_+|_+$/gu, '')

        return normalized || 'supplier'
    }

    /**
     * Returns normalized part-number strings.
     * @param {unknown} value Candidate part-number value.
     * @returns {string[]}
     */
    static #partNumbers(value) {
        const values = Array.isArray(value) ? value : [value]
        const partNumbers = values.flatMap((item) => {
            return String(item ?? '')
                .split(/[,;\n]+/u)
                .map((partNumber) => partNumber.trim())
                .filter(Boolean)
        })

        return [...new Set(partNumbers)]
    }

    /**
     * Returns the first non-empty string from candidate values.
     * @param {...unknown} values Candidate values.
     * @returns {string}
     */
    static #firstText(...values) {
        for (const value of values) {
            const text = String(value ?? '').trim()
            if (text) return text
        }

        return ''
    }

    /**
     * Returns true for plain object values.
     * @param {unknown} value Candidate value.
     * @returns {boolean}
     */
    static #isPlainObject(value) {
        return (
            !!value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            Object.getPrototypeOf(value) === Object.prototype
        )
    }
}
