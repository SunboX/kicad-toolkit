// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import {
    ToolkitAsset,
    ToolkitDiagnostic,
    ToolkitError,
    ToolkitProgress
} from 'circuitjson-toolkit/parser'

import { KicadDocumentBuilder } from './KicadDocumentBuilder.mjs'
import { KicadAsyncInputOwnership } from './KicadAsyncInputOwnership.mjs'
import { KicadWorkerClient } from './KicadWorkerClient.mjs'
import { ParserInput } from './ParserInput.mjs'

const ABORTED_GETTER = Object.getOwnPropertyDescriptor(
    AbortSignal.prototype,
    'aborted'
)?.get
const PROGRESS_MESSAGES = {
    detect: 'Detecting KiCad input.',
    decode: 'Decoding native KiCad data.',
    validate: 'Validating canonical CircuitJSON.',
    complete: 'KiCad parsing complete.'
}
const EXTENSION_IDS = new Set(['kicad.native-model'])

/** Parses KiCad documents into canonical CircuitJSON envelopes. */
export class Parser {
    /** @param {object} input Input. @param {object} [options] Options. @returns {object} Document. */
    static parse(input, options = {}) {
        try {
            const normalized = ParserInput.normalize(input, options)
            if (normalized.options.worker === true) {
                throw Parser.#error(
                    'Synchronous KiCad parsing cannot use a worker.',
                    'ERR_WORKER_SYNC_UNAVAILABLE',
                    'unsupported',
                    normalized.input.fileName
                )
            }
            Parser.#assertSupported(normalized.input)
            Parser.#assertExtensions(normalized)
            Parser.#assertReports(normalized)
            return KicadDocumentBuilder.build(normalized)
        } catch (error) {
            throw Parser.#parseError(error, input)
        }
    }

    /** @param {object} input Input. @param {object} [options] Options. @returns {object} Discriminated result. */
    static tryParse(input, options = {}) {
        try {
            return { ok: true, value: Parser.parse(input, options) }
        } catch (error) {
            const normalized = Parser.#parseError(error, input)
            return {
                ok: false,
                error: normalized,
                diagnostics: [
                    ToolkitDiagnostic.create({
                        code: normalized.code,
                        severity: 'error',
                        message: normalized.message,
                        source: normalized.source
                    })
                ]
            }
        }
    }

    /** @param {object} input Input. @param {object} [options] Options. @returns {Promise<object>} Document. */
    static async parseAsync(input, options = {}) {
        let normalized
        const inputOwned = KicadAsyncInputOwnership.ownsParser(input)
        try {
            normalized = ParserInput.normalize(input, options)
            Parser.#assertSupported(normalized.input)
            Parser.#assertExtensions(normalized)
            Parser.#assertReports(normalized)
            Parser.#assertNotCancelled(normalized)
            normalized = inputOwned
                ? { ...normalized, inputOwned: true }
                : Parser.#ownAsyncInput(normalized)
        } catch (error) {
            throw Parser.#parseError(error, input)
        }
        const useWorker =
            normalized.options.worker === true ||
            (normalized.options.worker === 'auto' &&
                normalized.options.retainSource !== 'reference' &&
                KicadWorkerClient.isAvailable())
        if (useWorker) {
            const attempt = await KicadWorkerClient.parseAttempt(
                normalized.input,
                normalized.options
            )
            if (attempt.ok) return attempt.value
            if (normalized.options.worker !== 'auto' || !attempt.unavailable) {
                throw Parser.#parseError(attempt.error, input)
            }
            KicadWorkerClient.dispose()
        }
        let progress = Parser.#progress(normalized, 'detect')
        Parser.#assertNotCancelled(normalized)
        progress = Parser.#progress(normalized, 'decode', progress)
        await Promise.resolve()
        Parser.#assertNotCancelled(normalized)
        let model
        try {
            model = KicadDocumentBuilder.decode(normalized)
        } catch (error) {
            throw Parser.#parseError(error, input)
        }
        progress = Parser.#progress(normalized, 'validate', progress)
        Parser.#assertNotCancelled(normalized)
        let document
        try {
            document = KicadDocumentBuilder.build(normalized, model)
        } catch (error) {
            throw Parser.#parseError(error, input)
        }
        Parser.#assertNotCancelled(normalized)
        Parser.#progress(normalized, 'complete', progress)
        Parser.#assertNotCancelled(normalized)
        return document
    }

    /**
     * Owns mutable parser bytes and assets before callbacks or async turns.
     * @param {object} normalized Normalized request.
     * @returns {object} Stable async request.
     */
    static #ownAsyncInput(normalized) {
        return {
            ...normalized,
            inputOwned: true,
            input: {
                ...normalized.input,
                data:
                    typeof normalized.input.data === 'string'
                        ? normalized.input.data
                        : ParserInput.bytes(normalized.input.data),
                assets: ToolkitAsset.prepareAll(normalized.input.assets, {
                    mode: normalized.options.decodeAssets
                })
            }
        }
    }

    /** @param {unknown} input Candidate. @returns {boolean} Support. */
    static supports(input) {
        return ParserInput.supports(input)
    }

    /** @param {object} normalized Request. @returns {void} */
    static #assertReports(normalized) {
        if (!normalized.options.reports.length) return
        throw Parser.#error(
            `KiCad parser report is unavailable: ${normalized.options.reports[0]}.`,
            'ERR_CAPABILITY_UNAVAILABLE',
            'unsupported',
            normalized.input.fileName,
            { reports: normalized.options.reports }
        )
    }

    /** @param {object} normalized Request. @returns {void} */
    static #assertExtensions(normalized) {
        if (!Array.isArray(normalized.options.extensions)) return
        const unknown = normalized.options.extensions.find(
            (id) => !EXTENSION_IDS.has(id)
        )
        if (!unknown) return
        throw Parser.#error(
            `KiCad parser extension is unavailable: ${unknown}.`,
            'ERR_CAPABILITY_UNAVAILABLE',
            'unsupported',
            normalized.input.fileName,
            { extensions: normalized.options.extensions }
        )
    }

    /** @param {object} input Input. @returns {void} */
    static #assertSupported(input) {
        if (ParserInput.supports(input)) return
        throw Parser.#error(
            `Unsupported KiCad input: ${input.fileName || '(unnamed)'}.`,
            'ERR_FORMAT_UNSUPPORTED',
            'unsupported',
            input.fileName
        )
    }

    /** @param {object} normalized Request. @param {string} stage Stage. @param {object | null} [previous] Previous. @returns {object | null} Row. */
    static #progress(normalized, stage, previous = null) {
        if (!normalized.options.onProgress) return previous
        const row = ToolkitProgress.create(
            { stage, message: PROGRESS_MESSAGES[stage] },
            previous
        )
        normalized.options.onProgress(row)
        return row
    }

    /** @param {object} normalized Request. @returns {void} */
    static #assertNotCancelled(normalized) {
        const { signal } = normalized.options
        if (signal === undefined || signal === null) return
        if (!ABORTED_GETTER) throw new TypeError('AbortSignal is unavailable.')
        let aborted
        try {
            aborted = Boolean(Reflect.apply(ABORTED_GETTER, signal, []))
        } catch {
            throw new TypeError('KiCad signal must be an AbortSignal.')
        }
        if (aborted) {
            throw Parser.#error(
                'KiCad parsing was cancelled.',
                'ERR_CANCELLED',
                'cancelled',
                normalized.input.fileName
            )
        }
    }

    /** @param {unknown} error Failure. @param {unknown} input Input. @returns {ToolkitError} Error. */
    static #parseError(error, input) {
        if (ToolkitError.trustedRecord(error)) return error
        return ToolkitError.from(error, {
            code: 'ERR_KICAD_PARSE',
            category: 'parse',
            format: 'kicad',
            source: ParserInput.fileName(input)
        })
    }

    /** @param {string} message Message. @param {string} code Code. @param {string} category Category. @param {string} source Source. @param {object} [details] Details. @returns {ToolkitError} Error. */
    static #error(message, code, category, source, details = {}) {
        return new ToolkitError(message, {
            code,
            category,
            format: 'kicad',
            source,
            details
        })
    }
}

Object.freeze(Parser.prototype)
Object.freeze(Parser)
