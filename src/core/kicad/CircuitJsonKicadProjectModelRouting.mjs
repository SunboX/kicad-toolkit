// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

/**
 * Resolves generic 3D model source routing for Circuit JSON KiCad exports.
 */
export class CircuitJsonKicadProjectModelRouting {
    /**
     * Builds a routed model descriptor for one source path.
     * @param {string} sourcePath Model source path.
     * @param {{ modelDirectory?: string, modelSourceRules?: object[] }} options Routing options.
     * @param {Set<string>} usedOutputPaths Used archive output paths.
     * @returns {{ name: string, sourcePath: string, outputPath: string, modelPath: string, format: string }}
     */
    static descriptorForSource(sourcePath, options, usedOutputPaths) {
        const rule = CircuitJsonKicadProjectModelRouting.ruleForSource(
            sourcePath,
            options.modelSourceRules
        )
        const directory = CircuitJsonKicadProjectModelRouting.outputDirectory(
            rule,
            options
        )
        const name = CircuitJsonKicadProjectModelRouting.uniqueName(
            Utils.safeFileName(sourcePath),
            directory,
            usedOutputPaths
        )

        return {
            name,
            sourcePath,
            outputPath: Utils.joinPath(directory, name),
            modelPath: CircuitJsonKicadProjectModelRouting.ruleModelPath(
                rule,
                name
            ),
            format: Utils.extension(name)
        }
    }

    /**
     * Normalizes one caller-supplied model file.
     * @param {object} model Candidate model file.
     * @param {number} index Fallback index.
     * @param {{ modelDirectory?: string, modelSourceRules?: object[] }} options Routing options.
     * @param {Set<string>} usedOutputPaths Used archive output paths.
     * @returns {{ name: string, sourcePath: string, bytes: Uint8Array, format: string, outputPath: string, modelPath: string }}
     */
    static normalizeModelFile(model, index, options, usedOutputPaths) {
        const sourcePath = Utils.text(
            model.sourcePath || model.path || model.relativePath || ''
        )
        const rule = CircuitJsonKicadProjectModelRouting.ruleForSource(
            sourcePath,
            options.modelSourceRules
        )
        const directory = CircuitJsonKicadProjectModelRouting.outputDirectory(
            {
                ...rule,
                modelDirectory:
                    model.modelDirectory ||
                    model.outputDirectory ||
                    rule.modelDirectory ||
                    rule.outputDirectory
            },
            options
        )
        const name = CircuitJsonKicadProjectModelRouting.uniqueName(
            Utils.safeFileName(
                model.name ||
                    Utils.baseName(sourcePath) ||
                    'model-' + (index + 1) + '.step'
            ),
            directory,
            usedOutputPaths
        )
        const outputPath = Utils.normalizeBasePath(
            model.outputPath || model.output_path
        )
        const routedOutputPath = outputPath || Utils.joinPath(directory, name)
        usedOutputPaths.add(routedOutputPath.toLowerCase())

        return {
            name,
            sourcePath,
            bytes: Utils.bytes(model.bytes),
            format: Utils.text(model.format) || Utils.extension(name),
            outputPath: routedOutputPath,
            modelPath:
                Utils.text(model.modelPath || model.model_path) ||
                CircuitJsonKicadProjectModelRouting.ruleModelPath(rule, name)
        }
    }

    /**
     * Resolves model directories represented by normalized model files.
     * @param {object[]} modelFiles Normalized model files.
     * @param {string} fallbackDirectory Fallback model directory.
     * @returns {string[]}
     */
    static modelDirectories(modelFiles, fallbackDirectory) {
        const directories = []
        const seen = new Set()

        for (const model of Array.isArray(modelFiles) ? modelFiles : []) {
            const directory =
                CircuitJsonKicadProjectModelRouting.outputPathDirectory(
                    model.outputPath
                ) || Utils.normalizeBasePath(fallbackDirectory)
            if (!directory || seen.has(directory.toLowerCase())) continue
            seen.add(directory.toLowerCase())
            directories.push(directory)
        }

        return directories
    }

    /**
     * Resolves the directory part of an archive output path.
     * @param {unknown} outputPath Candidate output path.
     * @returns {string}
     */
    static outputPathDirectory(outputPath) {
        const normalized = Utils.normalizeBasePath(outputPath)
        if (!normalized.includes('/')) return ''
        return normalized.split('/').slice(0, -1).join('/')
    }

    /**
     * Finds the first source routing rule matching a source path.
     * @param {string} sourcePath Model source path.
     * @param {unknown} rules Candidate routing rules.
     * @returns {object}
     */
    static ruleForSource(sourcePath, rules) {
        for (const rule of Array.isArray(rules) ? rules : []) {
            if (
                rule &&
                typeof rule === 'object' &&
                CircuitJsonKicadProjectModelRouting.matches(
                    rule.match ?? rule.source ?? rule.pattern,
                    sourcePath
                )
            ) {
                return rule
            }
        }
        return {}
    }

    /**
     * Checks whether a source matcher accepts a source path.
     * @param {unknown} matcher Source matcher.
     * @param {string} sourcePath Model source path.
     * @returns {boolean}
     */
    static matches(matcher, sourcePath) {
        if (typeof matcher === 'function') return matcher(sourcePath) === true
        if (matcher instanceof RegExp) {
            matcher.lastIndex = 0
            return matcher.test(sourcePath)
        }
        const text = Utils.text(matcher)
        return !!text && sourcePath.startsWith(text)
    }

    /**
     * Resolves the archive output directory for a rule.
     * @param {object} rule Routing rule.
     * @param {{ modelDirectory?: string }} options Routing options.
     * @returns {string}
     */
    static outputDirectory(rule, options) {
        return Utils.normalizeBasePath(
            rule.outputDirectory ||
                rule.modelDirectory ||
                options.modelDirectory ||
                'models'
        )
    }

    /**
     * Builds a model path from a rule-level reference prefix.
     * @param {object} rule Routing rule.
     * @param {string} name Model file name.
     * @returns {string}
     */
    static ruleModelPath(rule, name) {
        const modelPath = Utils.text(rule.modelPath || rule.model_path)
        if (modelPath) return modelPath
        const prefix = Utils.text(
            rule.modelPathPrefix || rule.model_path_prefix
        )
        if (!prefix) return ''
        return prefix + (prefix.endsWith('/') ? '' : '/') + name
    }

    /**
     * Builds a unique output name within an archive directory.
     * @param {string} name Candidate file name.
     * @param {string} outputDirectory Archive output directory.
     * @param {Set<string>} usedOutputPaths Used archive output paths.
     * @returns {string}
     */
    static uniqueName(name, outputDirectory, usedOutputPaths) {
        const baseName = Utils.baseName(name) || 'model.step'
        const extension = Utils.extension(baseName)
        const stem = extension
            ? baseName.slice(0, -(extension.length + 1))
            : baseName
        let candidate = baseName
        let index = 2

        while (
            usedOutputPaths.has(
                Utils.joinPath(outputDirectory, candidate).toLowerCase()
            )
        ) {
            candidate = extension
                ? stem + '-' + index + '.' + extension
                : stem + '-' + index
            index += 1
        }

        usedOutputPaths.add(
            Utils.joinPath(outputDirectory, candidate).toLowerCase()
        )
        return candidate
    }
}
