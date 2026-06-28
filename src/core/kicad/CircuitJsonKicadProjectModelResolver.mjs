// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'
import { CircuitJsonKicadProjectModelRouting as ModelRouting } from './CircuitJsonKicadProjectModelRouting.mjs'

/**
 * Loads CircuitJSON 3D model source paths into project-export model files.
 */
export class CircuitJsonKicadProjectModelResolver {
    /**
     * Resolves model source paths into exporter-ready model files.
     * @param {{ model3dSourcePaths?: string[], modelDirectory?: string, modelSourceRules?: object[], modelPathMode?: string, libraryName?: string, projectName?: string, fetch?: (sourcePath: string) => Promise<{ ok?: boolean, arrayBuffer?: () => Promise<ArrayBuffer | Uint8Array | string> }>, readFile?: (sourcePath: string) => Promise<ArrayBuffer | Uint8Array | string>, continueOnError?: boolean, onError?: (diagnostic: object) => void | Promise<void> }} [options] Resolve options.
     * @returns {Promise<{ modelFiles: object[], diagnostics: object[], loadDiagnostics: object[], summary: object }>}
     */
    static async resolve(options = {}) {
        const diagnostics = []
        const loadDiagnostics = []
        const modelFiles = []
        const sourcePaths = CircuitJsonKicadProjectModelResolver.#paths(
            options.model3dSourcePaths
        )
        const outputDirectory =
            CircuitJsonKicadProjectModelResolver.#outputDirectory(options)
        const usedOutputPaths = new Set()

        for (const sourcePath of sourcePaths) {
            const descriptor = ModelRouting.descriptorForSource(
                sourcePath,
                {
                    ...options,
                    modelDirectory: outputDirectory
                },
                usedOutputPaths
            )
            try {
                const modelFile =
                    await CircuitJsonKicadProjectModelResolver.#modelFile(
                        descriptor,
                        options
                    )
                modelFiles.push(modelFile)
                loadDiagnostics.push(
                    CircuitJsonKicadProjectModelResolver.#successDiagnostic(
                        modelFile
                    )
                )
            } catch (error) {
                const diagnostic =
                    CircuitJsonKicadProjectModelResolver.#diagnostic(
                        descriptor,
                        error
                    )
                diagnostics.push(diagnostic)
                loadDiagnostics.push(diagnostic)
                await options.onError?.(diagnostic)
                if (!options.continueOnError) throw error
            }
        }

        return {
            modelFiles,
            diagnostics,
            loadDiagnostics,
            summary: {
                sourcePathCount: sourcePaths.length,
                loadedCount: modelFiles.length,
                failedCount: diagnostics.length,
                diagnosticCount: diagnostics.length
            }
        }
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
     * Builds the archive output directory for resolved model files.
     * @param {object} options Resolve options.
     * @returns {string}
     */
    static #outputDirectory(options) {
        if (options.modelDirectory) {
            return Utils.normalizeBasePath(options.modelDirectory)
        }
        if (options.modelPathMode === 'library-shapes') {
            const libraryName = Utils.safeName(
                options.libraryName || options.projectName || ''
            )
            return '3dmodels/' + libraryName + '.3dshapes'
        }
        return 'models'
    }

    /**
     * Loads one source path as a normalized model file.
     * @param {object} descriptor Model path descriptor.
     * @param {object} options Resolve options.
     * @returns {Promise<object>}
     */
    static async #modelFile(descriptor, options) {
        const bytes = await CircuitJsonKicadProjectModelResolver.#bytes(
            descriptor.sourcePath,
            options
        )

        return {
            name: descriptor.name,
            sourcePath: descriptor.sourcePath,
            outputPath: descriptor.outputPath,
            modelPath: descriptor.modelPath,
            bytes,
            format: descriptor.format
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
     * Builds one successful model-load diagnostic.
     * @param {object} modelFile Resolved model file.
     * @returns {object}
     */
    static #successDiagnostic(modelFile) {
        return {
            severity: 'info',
            code: 'kicad_model_load_succeeded',
            sourcePath: modelFile.sourcePath,
            outputPath: modelFile.outputPath,
            name: modelFile.name,
            format: modelFile.format,
            byteLength: modelFile.bytes.byteLength,
            message:
                'Loaded 3D model source ' + Utils.baseName(modelFile.sourcePath)
        }
    }

    /**
     * Builds one model-load diagnostic.
     * @param {object} descriptor Model path descriptor.
     * @param {unknown} error Load error.
     * @returns {object}
     */
    static #diagnostic(descriptor, error) {
        return {
            severity: 'warning',
            code: 'kicad_model_load_failed',
            sourcePath: descriptor.sourcePath,
            outputPath: descriptor.outputPath,
            name: descriptor.name,
            format: descriptor.format,
            byteLength: 0,
            message:
                'Could not load 3D model source ' +
                Utils.baseName(descriptor.sourcePath),
            error: error instanceof Error ? error.message : String(error)
        }
    }
}
