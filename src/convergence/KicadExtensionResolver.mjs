// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const DOCUMENT_SCHEMA = 'ecad-toolkit.document.v1'

/** Resolves explicit KiCad source extensions without changing document shape. */
export class KicadExtensionResolver {
    /**
     * Returns the retained native renderer model when explicitly requested.
     * Historical native renderer models pass through unchanged so callers can
     * use one boundary during migration.
     * @param {unknown} document Canonical document or native renderer model.
     * @returns {Record<string, any> | null} Retained native model.
     */
    static nativeModel(document) {
        if (!KicadExtensionResolver.#record(document)) return null
        const schema = String(
            KicadExtensionResolver.#data(document, 'schema') || ''
        )
        if (schema !== DOCUMENT_SCHEMA) {
            return KicadExtensionResolver.#isLegacyModel(document, schema)
                ? document
                : null
        }

        const source = KicadExtensionResolver.#data(document, 'source')
        if (
            String(KicadExtensionResolver.#data(source, 'format') || '') !==
            'kicad'
        ) {
            return null
        }
        const extensions = KicadExtensionResolver.#data(document, 'extensions')
        const kicad = KicadExtensionResolver.#data(extensions, 'kicad')
        const native = KicadExtensionResolver.#data(kicad, 'native')
        return KicadExtensionResolver.#record(native) ? native : null
    }

    /**
     * Returns whether an explicit native renderer model is available.
     * @param {unknown} document Canonical document or native renderer model.
     * @returns {boolean} Whether native KiCad data can be resolved.
     */
    static hasNativeModel(document) {
        return KicadExtensionResolver.nativeModel(document) !== null
    }

    /**
     * Identifies a historical KiCad renderer model by its owned schema.
     * @param {Record<string, any>} value Model candidate.
     * @param {string} schema Owned schema value.
     * @returns {boolean} Whether the value is a native KiCad model.
     */
    static #isLegacyModel(value, schema) {
        if (
            schema.startsWith('urn:kicad-toolkit:') ||
            schema.startsWith('kicad-toolkit.')
        ) {
            return true
        }
        const sourceFormat = String(
            KicadExtensionResolver.#data(value, 'sourceFormat') || ''
        )
        return sourceFormat === 'kicad'
    }

    /**
     * Reads one own data property without invoking accessors.
     * @param {unknown} owner Field owner.
     * @param {string} key Field name.
     * @returns {unknown} Own data value or undefined.
     */
    static #data(owner, key) {
        if (!KicadExtensionResolver.#record(owner)) return undefined
        try {
            const descriptor = Object.getOwnPropertyDescriptor(owner, key)
            return descriptor && Object.hasOwn(descriptor, 'value')
                ? descriptor.value
                : undefined
        } catch {
            return undefined
        }
    }

    /**
     * Returns true for non-array object records.
     * @param {unknown} value Candidate value.
     * @returns {boolean} Whether the value is a record.
     */
    static #record(value) {
        return Boolean(
            value && typeof value === 'object' && !Array.isArray(value)
        )
    }
}

Object.freeze(KicadExtensionResolver.prototype)
Object.freeze(KicadExtensionResolver)
