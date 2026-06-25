// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

/**
 * Loads CircuitJSON 3D model source paths into project-export model files.
 */
export class CircuitJsonKicadProjectModelResolver {
    /**
     * Resolves model source paths into exporter-ready model files.
     * @param {{ model3dSourcePaths?: string[], fetch?: (sourcePath: string) => Promise<{ ok?: boolean, arrayBuffer?: () => Promise<ArrayBuffer | Uint8Array | string> }>, readFile?: (sourcePath: string) => Promise<ArrayBuffer | Uint8Array | string>, continueOnError?: boolean, onError?: (diagnostic: object) => void | Promise<void> }} [options] Resolve options.
     * @returns {Promise<{ modelFiles: object[], diagnostics: object[] }>}
     */
    static async resolve(options = {}) {
        const diagnostics = []
        const modelFiles = []
        const usedNames = new Set()

        for (const sourcePath of CircuitJsonKicadProjectModelResolver.#paths(
            options.model3dSourcePaths
        )) {
            try {
                modelFiles.push(
                    await CircuitJsonKicadProjectModelResolver.#modelFile(
                        sourcePath,
                        options,
                        usedNames
                    )
                )
            } catch (error) {
                const diagnostic =
                    CircuitJsonKicadProjectModelResolver.#diagnostic(
                        sourcePath,
                        error
                    )
                diagnostics.push(diagnostic)
                await options.onError?.(diagnostic)
                if (!options.continueOnError) throw error
            }
        }

        return { modelFiles, diagnostics }
    }

    /**
     * Builds a de-duplicated source path list.
     * @param {unknown} model3dSourcePaths Candidate source paths.
     * @returns {string[]}
     */
    static #paths(model3dSourcePaths) {
        const seen = new Set()
        const paths = []

        for (const value of Array.isArray(model3dSourcePaths)
            ? model3dSourcePaths
            : []) {
            const sourcePath = Utils.text(value).trim()
            const key = sourcePath.toLowerCase()
            if (!sourcePath || seen.has(key)) continue
            seen.add(key)
            paths.push(sourcePath)
        }

        return paths
    }

    /**
     * Loads one source path as a normalized model file.
     * @param {string} sourcePath Model source path.
     * @param {object} options Resolve options.
     * @param {Set<string>} usedNames Already used output file names.
     * @returns {Promise<object>}
     */
    static async #modelFile(sourcePath, options, usedNames) {
        const name = CircuitJsonKicadProjectModelResolver.#uniqueName(
            Utils.safeFileName(sourcePath),
            usedNames
        )
        const bytes = await CircuitJsonKicadProjectModelResolver.#bytes(
            sourcePath,
            options
        )

        return {
            name,
            sourcePath,
            bytes,
            format: Utils.extension(name)
        }
    }

    /**
     * Loads bytes for one local or remote model source.
     * @param {string} sourcePath Model source path.
     * @param {{ fetch?: Function, readFile?: Function }} options Resolve options.
     * @returns {Promise<Uint8Array>}
     */
    static async #bytes(sourcePath, options) {
        if (CircuitJsonKicadProjectModelResolver.#isRemote(sourcePath)) {
            if (typeof options.fetch !== 'function') {
                throw new Error('Cannot fetch remote model without fetch')
            }
            const response = await options.fetch(sourcePath)
            if (!response?.ok) {
                throw new Error('Remote model request failed')
            }
            return Utils.bytes(await response.arrayBuffer?.())
        }

        if (typeof options.readFile !== 'function') {
            throw new Error('Cannot read local model without readFile')
        }
        return Utils.bytes(await options.readFile(sourcePath))
    }

    /**
     * Returns true when a source path is a remote URL.
     * @param {string} sourcePath Model source path.
     * @returns {boolean}
     */
    static #isRemote(sourcePath) {
        return /^https?:\/\//iu.test(sourcePath)
    }

    /**
     * Builds a unique archive file name while preserving the extension.
     * @param {string} name Candidate file name.
     * @param {Set<string>} usedNames Already used output file names.
     * @returns {string}
     */
    static #uniqueName(name, usedNames) {
        const baseName = Utils.baseName(name) || 'model.step'
        const extension = Utils.extension(baseName)
        const stem = extension
            ? baseName.slice(0, -(extension.length + 1))
            : baseName
        let candidate = baseName
        let index = 2

        while (usedNames.has(candidate.toLowerCase())) {
            candidate = extension
                ? stem + '-' + index + '.' + extension
                : stem + '-' + index
            index += 1
        }

        usedNames.add(candidate.toLowerCase())
        return candidate
    }

    /**
     * Builds one model-load diagnostic.
     * @param {string} sourcePath Failed source path.
     * @param {unknown} error Load error.
     * @returns {object}
     */
    static #diagnostic(sourcePath, error) {
        return {
            severity: 'warning',
            code: 'kicad_model_load_failed',
            sourcePath,
            message:
                'Could not load 3D model source ' + Utils.baseName(sourcePath),
            error: error instanceof Error ? error.message : String(error)
        }
    }
}
