// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const ASSET_MODES = new Set(['none', 'metadata', 'full'])
const EXTENSION_MODES = new Set(['none', 'metadata', 'canonical', 'full'])
const RETAIN_SOURCE_MODES = new Set(['none', 'reference'])
const WORKER_MODES = new Set(['auto', true, false])
const ARRAY_BUFFER_LENGTH = Object.getOwnPropertyDescriptor(
    ArrayBuffer.prototype,
    'byteLength'
)?.get
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype)
const TYPED_ARRAY_BUFFER = Object.getOwnPropertyDescriptor(
    TYPED_ARRAY_PROTOTYPE,
    'buffer'
)?.get
const TYPED_ARRAY_OFFSET = Object.getOwnPropertyDescriptor(
    TYPED_ARRAY_PROTOTYPE,
    'byteOffset'
)?.get
const TYPED_ARRAY_LENGTH = Object.getOwnPropertyDescriptor(
    TYPED_ARRAY_PROTOTYPE,
    'byteLength'
)?.get
const UINT8_ARRAY_SET = Uint8Array.prototype.set
const SUFFIXES =
    /(?:\.kicad_(?:pcb|sch|mod|sym|jobset|dru|wks)|(?:^|\/)(?:fp|sym)-lib-table|\.(?:net|cmp|lib|dcm|mod))$/iu

/** Normalizes source-neutral parser requests for the KiCad adapter. */
export class ParserInput {
    /**
     * Normalizes one parser request without invoking caller accessors.
     * @param {unknown} input Parser input candidate.
     * @param {unknown} [options] Common parser options.
     * @returns {Record<string, any>} Normalized request.
     */
    static normalize(input, options = {}) {
        const fields = ParserInput.plainFields(
            input,
            'KiCad parser input must be a plain object.'
        )
        const optionFields = ParserInput.plainFields(
            options,
            'KiCad parser options must be a plain object.'
        )
        if (!ParserInput.isData(fields.data)) {
            throw new TypeError(
                'KiCad parser data must be a string, ArrayBuffer, or Uint8Array.'
            )
        }
        if (fields.assets !== undefined && !Array.isArray(fields.assets)) {
            throw new TypeError('KiCad parser assets must be an array.')
        }
        const worker =
            optionFields.worker === undefined ? 'auto' : optionFields.worker
        if (!WORKER_MODES.has(worker)) {
            throw new TypeError('KiCad worker must be auto, true, or false.')
        }
        if (
            optionFields.onProgress !== undefined &&
            typeof optionFields.onProgress !== 'function'
        ) {
            throw new TypeError('KiCad onProgress must be a function.')
        }
        return {
            input: {
                fileName: ParserInput.fileName(fields.fileName),
                data: fields.data,
                assets: fields.assets || []
            },
            sourceReference: input,
            options: {
                preserveRaw: optionFields.preserveRaw === true,
                decodeAssets: ParserInput.enumValue(
                    optionFields.decodeAssets,
                    'metadata',
                    ASSET_MODES,
                    'asset decode mode'
                ),
                extensions: ParserInput.extensions(optionFields.extensions),
                reports: ParserInput.stringList(optionFields.reports),
                retainSource: ParserInput.enumValue(
                    optionFields.retainSource,
                    'none',
                    RETAIN_SOURCE_MODES,
                    'source retention mode'
                ),
                worker,
                transferInput: optionFields.transferInput === true,
                signal: optionFields.signal,
                onProgress: optionFields.onProgress
            }
        }
    }

    /** @param {unknown} input Candidate. @returns {boolean} Support result. */
    static supports(input) {
        try {
            const fields = ParserInput.plainFields(
                input,
                'KiCad parser input must be a plain object.'
            )
            return (
                ParserInput.isData(fields.data) &&
                SUFFIXES.test(ParserInput.fileName(fields.fileName))
            )
        } catch {
            return false
        }
    }

    /** @param {unknown} input Input or filename. @returns {string} Name. */
    static fileName(input) {
        let value = input
        if (input && typeof input === 'object') {
            try {
                value = ParserInput.plainFields(
                    input,
                    'KiCad parser input must be a plain object.'
                ).fileName
            } catch {
                value = ''
            }
        }
        if (
            value !== undefined &&
            value !== null &&
            !['string', 'number', 'boolean', 'bigint'].includes(typeof value)
        ) {
            return ''
        }
        return String(value || '')
            .replaceAll('\\', '/')
            .replace(/^\.\//u, '')
    }

    /** @param {unknown} input Input. @returns {string} File type. */
    static suffix(input) {
        const name = ParserInput.fileName(input)
        const baseName = name.split('/').at(-1) || ''
        if (/^(?:fp|sym)-lib-table$/iu.test(baseName)) {
            return baseName.toLowerCase()
        }
        const suffix = baseName.split('.').pop()
        return suffix && suffix !== baseName ? suffix.toLowerCase() : ''
    }

    /** @param {string | ArrayBuffer | Uint8Array} data Data. @returns {Uint8Array} Exact bytes. */
    static bytes(data) {
        if (typeof data === 'string') return new TextEncoder().encode(data)
        const range = ParserInput.#binaryRange(data)
        if (range) return ParserInput.#copyRange(range)
        throw new TypeError('Unsupported KiCad parser data.')
    }

    /** @param {unknown} value Candidate. @returns {boolean} Data support. */
    static isData(value) {
        return Boolean(
            typeof value === 'string' || ParserInput.#binaryRange(value)
        )
    }

    /** @param {unknown} value Value. @param {string} message Message. @returns {Record<string, any>} Fields. */
    static plainFields(value, message) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new TypeError(message)
        }
        let prototype
        let descriptors
        try {
            prototype = Object.getPrototypeOf(value)
            descriptors = Object.getOwnPropertyDescriptors(value)
        } catch {
            throw new TypeError(message)
        }
        if (prototype !== Object.prototype && prototype !== null) {
            throw new TypeError(message)
        }
        const fields = Object.create(null)
        for (const [name, descriptor] of Object.entries(descriptors)) {
            if (!Object.hasOwn(descriptor, 'value')) {
                throw new TypeError(
                    'Accessor-backed parser fields are invalid.'
                )
            }
            fields[name] = descriptor.value
        }
        return fields
    }

    /** @param {unknown} value Value. @param {string} fallback Default. @param {Set<any>} allowed Allowed. @param {string} label Label. @returns {any} Value. */
    static enumValue(value, fallback, allowed, label) {
        const normalized = value === undefined ? fallback : value
        if (!allowed.has(normalized)) {
            throw new TypeError(`Unsupported KiCad ${label}.`)
        }
        return normalized
    }

    /** @param {unknown} value Value. @returns {string | string[]} Extensions. */
    static extensions(value) {
        if (Array.isArray(value)) return ParserInput.stringList(value)
        return ParserInput.enumValue(
            value,
            'canonical',
            EXTENSION_MODES,
            'extension mode'
        )
    }

    /** @param {unknown} value Value. @returns {string[]} Unique ids. */
    static stringList(value) {
        if (value === undefined) return []
        const descriptors = ParserInput.#arrayDescriptors(value)
        const values = []
        const seen = new Set()
        for (let index = 0; index < descriptors.length.value; index += 1) {
            const item = descriptors[String(index)].value
            if (typeof item !== 'string' || !item.trim()) {
                throw new TypeError(
                    'KiCad option ids must be non-empty strings.'
                )
            }
            const normalized = item.trim()
            if (!seen.has(normalized)) {
                seen.add(normalized)
                values.push(normalized)
            }
        }
        return values
    }

    /**
     * Reads one dense option array without invoking iteration or accessors.
     * @param {unknown} value Array candidate.
     * @returns {Record<string, PropertyDescriptor>} Safe descriptors.
     */
    static #arrayDescriptors(value) {
        if (!Array.isArray(value)) {
            throw new TypeError('KiCad option list must be an array.')
        }
        let prototype
        let descriptors
        try {
            prototype = Object.getPrototypeOf(value)
            descriptors = Object.getOwnPropertyDescriptors(value)
        } catch {
            throw new TypeError('KiCad option list could not be inspected.')
        }
        const length = descriptors.length?.value
        if (
            prototype !== Array.prototype ||
            !Number.isSafeInteger(length) ||
            length < 0 ||
            Reflect.ownKeys(descriptors).length !== length + 1
        ) {
            throw new TypeError('KiCad option list must be a dense array.')
        }
        for (let index = 0; index < length; index += 1) {
            const descriptor = descriptors[String(index)]
            if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
                throw new TypeError(
                    'KiCad option list must use data properties.'
                )
            }
        }
        return descriptors
    }

    /**
     * Captures intrinsic binary range slots for ArrayBuffer or Uint8Array.
     * @param {unknown} value Binary candidate.
     * @returns {{ buffer: ArrayBuffer | SharedArrayBuffer, byteOffset: number, byteLength: number } | null} Captured range.
     */
    static #binaryRange(value) {
        const arrayLength = ParserInput.#callLength(ARRAY_BUFFER_LENGTH, value)
        if (arrayLength !== null) {
            return { buffer: value, byteOffset: 0, byteLength: arrayLength }
        }
        try {
            const buffer = TYPED_ARRAY_BUFFER?.call(value)
            const byteOffset = TYPED_ARRAY_OFFSET?.call(value)
            const byteLength = TYPED_ARRAY_LENGTH?.call(value)
            if (
                Object.getPrototypeOf(value) !== Uint8Array.prototype &&
                !(value instanceof Uint8Array)
            ) {
                return null
            }
            return { buffer, byteOffset, byteLength }
        } catch {
            return null
        }
    }

    /**
     * Calls a captured buffer-length getter as a brand check.
     * @param {Function | null | undefined} getter Intrinsic getter.
     * @param {unknown} value Candidate.
     * @returns {number | null} Byte length or null.
     */
    static #callLength(getter, value) {
        if (typeof getter !== 'function') return null
        try {
            return getter.call(value)
        } catch {
            return null
        }
    }

    /**
     * Copies one captured range into isolated non-shared memory.
     * @param {{ buffer: ArrayBuffer | SharedArrayBuffer, byteOffset: number, byteLength: number }} range Captured range.
     * @returns {Uint8Array} Owned bytes.
     */
    static #copyRange(range) {
        try {
            const source = new Uint8Array(
                range.buffer,
                range.byteOffset,
                range.byteLength
            )
            const bytes = new Uint8Array(range.byteLength)
            UINT8_ARRAY_SET.call(bytes, source)
            return bytes
        } catch {
            throw new TypeError('KiCad binary data changed during capture.')
        }
    }
}

Object.freeze(ParserInput.prototype)
Object.freeze(ParserInput)
