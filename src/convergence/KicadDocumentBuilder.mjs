// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonDocument } from 'circuitjson-toolkit'
import { DocumentResult, ToolkitAsset } from 'circuitjson-toolkit/parser'

import { KicadParser } from '../core/kicad/KicadParser.mjs'
import { CircuitJsonGeneratedAssetContext } from '../core/circuit-json/CircuitJsonGeneratedAssetContext.mjs'
import { ParserInput } from './ParserInput.mjs'

/** Converts native KiCad parses into canonical CircuitJSON envelopes. */
export class KicadDocumentBuilder {
    /**
     * Runs native parsing and CircuitJSON projection exactly once.
     * @param {Record<string, any>} normalized Normalized request.
     * @returns {object[]} CircuitJSON model.
     */
    static decode(normalized) {
        return KicadParser.parseArrayBuffer(
            normalized.input.fileName,
            normalized.inputOwned === true &&
                normalized.input.data instanceof Uint8Array
                ? normalized.input.data
                : ParserInput.bytes(normalized.input.data),
            {
                modelAssetNames:
                    KicadDocumentBuilder.#modelAssetNames(normalized),
                projectRoot: normalized.projectRoot
            }
        )
    }

    /**
     * Collects exact canonical model asset names without retaining payloads.
     * @param {Record<string, any>} normalized Normalized request.
     * @returns {string[]} Unique asset paths.
     */
    static #modelAssetNames(normalized) {
        const inputAssets = ToolkitAsset.prepareAll(normalized.input.assets, {
            mode: 'metadata'
        })
        return [
            ...new Set([
                ...(Array.isArray(normalized.projectAssetNames)
                    ? normalized.projectAssetNames.map(String)
                    : []),
                ...inputAssets.map((asset) => asset.name)
            ])
        ]
    }

    /**
     * Builds one validated document from a normalized request.
     * @param {Record<string, any>} normalized Normalized request.
     * @param {object[] | null} [model] Existing model.
     * @returns {Record<string, any>} Canonical document.
     */
    static build(normalized, model = null) {
        return KicadDocumentBuilder.fromModel(
            model || KicadDocumentBuilder.decode(normalized),
            normalized.input.fileName,
            normalized
        )
    }

    /**
     * Wraps one already parsed CircuitJSON model without reparsing.
     * @param {object[]} model CircuitJSON model.
     * @param {string} fileName Source name.
     * @param {Record<string, any>} normalized Normalized request.
     * @returns {Record<string, any>} Canonical document.
     */
    static fromModel(model, fileName, normalized) {
        const generatedAssets = CircuitJsonGeneratedAssetContext.forModel(model)
        const canonicalModel = CircuitJsonDocument.normalizeModel(
            Array.from(model)
        )
        const extension = KicadDocumentBuilder.#extension(
            model,
            normalized.options
        )
        const runtime =
            normalized.options.retainSource === 'reference'
                ? { sourceReference: normalized.sourceReference }
                : {}
        return DocumentResult.createValidated(
            {
                model: canonicalModel,
                source: {
                    format: 'kicad',
                    fileName,
                    fileType: ParserInput.suffix(fileName)
                },
                extensions: extension ? { kicad: extension } : {},
                assets: [
                    ...ToolkitAsset.prepareAll(normalized.input.assets, {
                        mode: normalized.options.decodeAssets
                    }),
                    ...ToolkitAsset.prepareAll(generatedAssets, {
                        mode: normalized.options.decodeAssets
                    })
                ],
                diagnostics: model?.diagnostics || [],
                statistics: {
                    canonicalElementCount: canonicalModel.length,
                    nativeKind: String(model?.kind || ''),
                    nativeBomRowCount: model?.bom?.length || 0
                }
            },
            runtime
        )
    }

    /**
     * Selects compact or full source-native extension data.
     * @param {object[]} model CircuitJSON model.
     * @param {Record<string, any>} options Common options.
     * @returns {Record<string, any> | null} Extension payload.
     */
    static #extension(model, options) {
        if (
            options.extensions === 'none' ||
            (Array.isArray(options.extensions) && !options.extensions.length)
        ) {
            return null
        }
        const includeNative =
            options.extensions === 'full' ||
            options.preserveRaw ||
            (Array.isArray(options.extensions) &&
                options.extensions.includes('kicad.native-model'))
        const completeness =
            options.extensions === 'full'
                ? 'full'
                : options.extensions === 'metadata'
                  ? 'metadata'
                  : 'canonical'
        const metadata = {
            $meta: {
                schema: 'ecad-toolkit.extension.v1',
                completeness,
                included: [
                    'kicad.summary',
                    ...(includeNative ? ['kicad.native-model'] : [])
                ],
                omitted: []
            },
            kind: String(model?.kind || ''),
            summary: model?.summary || {}
        }
        return includeNative
            ? {
                  ...metadata,
                  native: KicadDocumentBuilder.#nativeModel(model)
              }
            : metadata
    }

    /**
     * Copies renderer-compatibility fields off the legacy augmented array.
     * @param {object[]} model Legacy augmented CircuitJSON result.
     * @returns {Record<string, any>} Plain native renderer model.
     */
    static #nativeModel(model) {
        const native = {}
        for (const [name, value] of Object.entries(model)) {
            if (!/^\d+$/u.test(name)) native[name] = value
        }
        return native
    }
}

Object.freeze(KicadDocumentBuilder.prototype)
Object.freeze(KicadDocumentBuilder)
