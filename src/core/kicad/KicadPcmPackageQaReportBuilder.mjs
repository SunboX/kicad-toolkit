// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { strFromU8, unzipSync } from 'fflate'
import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'
import { KicadFootprintLibraryParser } from './KicadFootprintLibraryParser.mjs'
import { KicadSymbolLibraryParser } from './KicadSymbolLibraryParser.mjs'

const SCHEMA_ID = 'kicad-toolkit.pcm-package-qa.a1'
const LIBRARY_TABLE_NAMES = new Set(['fp-lib-table', 'sym-lib-table'])
const MODEL_EXTENSIONS = new Set([
    'step',
    'stp',
    'wrl',
    'vrml',
    'glb',
    'gltf',
    'stl',
    'obj'
])
const REPOSITORY_VERSION_FIELDS = new Set([
    'download_sha256',
    'download_size',
    'download_url',
    'install_size'
])

/**
 * Builds publish-readiness reports for installable KiCad package archives.
 */
export class KicadPcmPackageQaReportBuilder {
    /**
     * Builds a package QA report from expanded entries or ZIP bytes.
     * @param {{ entries?: object[], archiveBytes?: Uint8Array, bytes?: Uint8Array, strictPackage?: boolean }} [options] Package input.
     * @returns {object}
     */
    static build(options = {}) {
        const diagnostics = []
        const entries = KicadPcmPackageQaReportBuilder.#entries(
            options,
            diagnostics
        )
        const entryMap = new Map(
            entries.map((entry) => [Utils.normalizeBasePath(entry.path), entry])
        )
        const metadata = KicadPcmPackageQaReportBuilder.#metadata(
            entryMap,
            diagnostics
        )

        if (options.strictPackage === true) {
            diagnostics.push(
                ...KicadPcmPackageQaReportBuilder.#strictDiagnostics(
                    entries,
                    metadata
                )
            )
        }

        const symbolLibraries = KicadPcmPackageQaReportBuilder.#symbolLibraries(
            entries,
            diagnostics
        )
        const footprints = KicadPcmPackageQaReportBuilder.#footprints(
            entries,
            diagnostics
        )
        const modelEntries =
            KicadPcmPackageQaReportBuilder.#modelEntries(entries)
        const unresolvedModelDiagnostics =
            KicadPcmPackageQaReportBuilder.#unresolvedModelDiagnostics(
                footprints,
                modelEntries
            )
        diagnostics.push(...unresolvedModelDiagnostics)

        return {
            schema: SCHEMA_ID,
            pass: diagnostics.every(
                (diagnostic) => diagnostic.severity !== 'error'
            ),
            summary: {
                metadataPresent: Boolean(metadata),
                symbolLibraryCount: symbolLibraries.length,
                footprintCount: footprints.length,
                modelEntryCount: modelEntries.length,
                modelReferenceCount:
                    KicadPcmPackageQaReportBuilder.#modelReferenceCount(
                        footprints
                    ),
                unresolvedModelReferenceCount:
                    unresolvedModelDiagnostics.length,
                diagnosticCount: diagnostics.length
            },
            metadata,
            symbolLibraries,
            footprints,
            modelEntries,
            diagnostics
        }
    }

    /**
     * Normalizes input entries from expanded rows or a ZIP archive.
     * @param {object} options Package input.
     * @param {object[]} diagnostics Diagnostics sink.
     * @returns {{ path: string, bytes: Uint8Array, contentType?: string }[]}
     */
    static #entries(options, diagnostics) {
        if (Array.isArray(options.entries)) {
            return KicadPcmPackageQaReportBuilder.#entryRows(options.entries)
        }

        const archiveBytes = Utils.bytes(options.archiveBytes || options.bytes)
        if (!archiveBytes.length) return []

        try {
            return Object.entries(unzipSync(archiveBytes))
                .map(([path, bytes]) => ({
                    path: Utils.normalizeBasePath(path),
                    bytes
                }))
                .filter((entry) => entry.path)
                .sort((left, right) => left.path.localeCompare(right.path))
        } catch (error) {
            diagnostics.push(
                KicadPcmPackageQaReportBuilder.#diagnostic(
                    'kicad-pcm-package.archive-invalid',
                    'Package archive bytes are not a readable ZIP archive.',
                    { error }
                )
            )
            return []
        }
    }

    /**
     * Normalizes expanded package entry rows.
     * @param {object[]} entries Candidate entries.
     * @returns {{ path: string, bytes: Uint8Array, contentType?: string }[]}
     */
    static #entryRows(entries) {
        return entries
            .map((entry) => {
                const source = entry && typeof entry === 'object' ? entry : {}
                return {
                    path: Utils.normalizeBasePath(source.path || source.name),
                    bytes: Utils.bytes(source.bytes),
                    contentType: source.contentType
                }
            })
            .filter((entry) => entry.path)
            .sort((left, right) => left.path.localeCompare(right.path))
    }

    /**
     * Parses root package metadata.
     * @param {Map<string, object>} entryMap Entries keyed by normalized path.
     * @param {object[]} diagnostics Diagnostics sink.
     * @returns {object | null}
     */
    static #metadata(entryMap, diagnostics) {
        const entry = entryMap.get('metadata.json')
        if (!entry) {
            diagnostics.push(
                KicadPcmPackageQaReportBuilder.#diagnostic(
                    'kicad-pcm-package.metadata-missing',
                    'Package archive is missing root metadata.json.'
                )
            )
            return null
        }

        try {
            return JSON.parse(strFromU8(entry.bytes))
        } catch (error) {
            diagnostics.push(
                KicadPcmPackageQaReportBuilder.#diagnostic(
                    'kicad-pcm-package.metadata-invalid',
                    'Package metadata.json is not valid JSON.',
                    { path: 'metadata.json', error }
                )
            )
            return null
        }
    }

    /**
     * Builds strict package diagnostics.
     * @param {object[]} entries Package entries.
     * @param {object | null} metadata Parsed metadata.
     * @returns {object[]}
     */
    static #strictDiagnostics(entries, metadata) {
        return [
            ...KicadPcmPackageQaReportBuilder.#libraryTableDiagnostics(entries),
            ...KicadPcmPackageQaReportBuilder.#repositoryFieldDiagnostics(
                metadata
            )
        ]
    }

    /**
     * Reports library table entries that strict installable packages should omit.
     * @param {object[]} entries Package entries.
     * @returns {object[]}
     */
    static #libraryTableDiagnostics(entries) {
        return entries
            .filter((entry) =>
                LIBRARY_TABLE_NAMES.has(Utils.baseName(entry.path))
            )
            .map((entry) =>
                KicadPcmPackageQaReportBuilder.#diagnostic(
                    'kicad-pcm-package.unwanted-library-table',
                    'Strict package archives should not include library table entries.',
                    { path: entry.path }
                )
            )
    }

    /**
     * Reports repository-only fields embedded in archive metadata.
     * @param {object | null} metadata Parsed metadata.
     * @returns {object[]}
     */
    static #repositoryFieldDiagnostics(metadata) {
        if (!metadata) return []
        return KicadPcmPackageQaReportBuilder.#repositoryFieldPaths(
            metadata
        ).map((metadataPath) =>
            KicadPcmPackageQaReportBuilder.#diagnostic(
                'kicad-pcm-package.repository-field',
                'Package metadata should not contain repository download fields.',
                { metadataPath }
            )
        )
    }

    /**
     * Finds repository-only metadata field paths.
     * @param {unknown} value Metadata value.
     * @param {string} [basePath] Current metadata path.
     * @returns {string[]}
     */
    static #repositoryFieldPaths(value, basePath = '$') {
        if (!value || typeof value !== 'object') return []
        if (Array.isArray(value)) {
            return value.flatMap((item, index) =>
                KicadPcmPackageQaReportBuilder.#repositoryFieldPaths(
                    item,
                    basePath + '[' + index + ']'
                )
            )
        }

        return Object.entries(value).flatMap(([key, childValue]) => [
            ...(REPOSITORY_VERSION_FIELDS.has(key)
                ? [basePath + '.' + key]
                : []),
            ...KicadPcmPackageQaReportBuilder.#repositoryFieldPaths(
                childValue,
                basePath + '.' + key
            )
        ])
    }

    /**
     * Parses package symbol libraries.
     * @param {object[]} entries Package entries.
     * @param {object[]} diagnostics Diagnostics sink.
     * @returns {object[]}
     */
    static #symbolLibraries(entries, diagnostics) {
        return entries
            .filter((entry) => entry.path.endsWith('.kicad_sym'))
            .map((entry) =>
                KicadPcmPackageQaReportBuilder.#symbolLibrary(
                    entry,
                    diagnostics
                )
            )
            .filter(Boolean)
            .sort((left, right) => left.path.localeCompare(right.path))
    }

    /**
     * Parses one package symbol library.
     * @param {object} entry Symbol entry.
     * @param {object[]} diagnostics Diagnostics sink.
     * @returns {object | null}
     */
    static #symbolLibrary(entry, diagnostics) {
        try {
            const parsed = KicadSymbolLibraryParser.parse(
                strFromU8(entry.bytes),
                {
                    fileName: entry.path
                }
            )
            return {
                path: entry.path,
                symbolCount: parsed.summary?.symbolCount || 0
            }
        } catch (error) {
            diagnostics.push(
                KicadPcmPackageQaReportBuilder.#diagnostic(
                    'kicad-pcm-package.symbol-parse-failed',
                    'Package symbol library could not be parsed.',
                    { path: entry.path, error }
                )
            )
            return null
        }
    }

    /**
     * Parses package footprint entries.
     * @param {object[]} entries Package entries.
     * @param {object[]} diagnostics Diagnostics sink.
     * @returns {object[]}
     */
    static #footprints(entries, diagnostics) {
        return entries
            .filter((entry) => entry.path.endsWith('.kicad_mod'))
            .map((entry) =>
                KicadPcmPackageQaReportBuilder.#footprint(entry, diagnostics)
            )
            .filter(Boolean)
            .sort((left, right) => left.path.localeCompare(right.path))
    }

    /**
     * Parses one package footprint.
     * @param {object} entry Footprint entry.
     * @param {object[]} diagnostics Diagnostics sink.
     * @returns {object | null}
     */
    static #footprint(entry, diagnostics) {
        try {
            const parsed = KicadFootprintLibraryParser.parse(
                strFromU8(entry.bytes),
                { fileName: entry.path }
            )
            const footprintName =
                Utils.text(parsed.footprint?.footprintName) ||
                Utils.text(parsed.footprint?.name) ||
                stripExtension(Utils.baseName(entry.path))
            return {
                path: entry.path,
                footprintName,
                modelReferences:
                    KicadPcmPackageQaReportBuilder.#modelReferences(parsed)
            }
        } catch (error) {
            diagnostics.push(
                KicadPcmPackageQaReportBuilder.#diagnostic(
                    'kicad-pcm-package.footprint-parse-failed',
                    'Package footprint could not be parsed.',
                    { path: entry.path, error }
                )
            )
            return null
        }
    }

    /**
     * Collects model references from a parsed footprint.
     * @param {object} parsed Parsed footprint library.
     * @returns {string[]}
     */
    static #modelReferences(parsed) {
        const models = [
            ...(Array.isArray(parsed.models) ? parsed.models : []),
            ...(Array.isArray(parsed.footprint?.models)
                ? parsed.footprint.models
                : [])
        ]
        return [
            ...new Set(
                models
                    .map((model) =>
                        Utils.text(model?.path || model?.name || model?.file)
                    )
                    .filter(Boolean)
            )
        ].sort()
    }

    /**
     * Collects packaged 3D model entries.
     * @param {object[]} entries Package entries.
     * @returns {string[]}
     */
    static #modelEntries(entries) {
        return entries
            .map((entry) => Utils.normalizeBasePath(entry.path))
            .filter((path) => path.startsWith('3dmodels/'))
            .filter((path) => MODEL_EXTENSIONS.has(Utils.extension(path)))
            .sort()
    }

    /**
     * Builds diagnostics for unresolved footprint model references.
     * @param {object[]} footprints Parsed footprint report rows.
     * @param {string[]} modelEntries Packaged model entry paths.
     * @returns {object[]}
     */
    static #unresolvedModelDiagnostics(footprints, modelEntries) {
        const modelEntrySet = new Set(modelEntries)
        const modelsByBaseName =
            KicadPcmPackageQaReportBuilder.#modelsByBaseName(modelEntries)
        const diagnostics = []

        for (const footprint of footprints) {
            for (const modelReference of footprint.modelReferences) {
                if (
                    KicadPcmPackageQaReportBuilder.#modelReferenceResolved(
                        modelReference,
                        modelEntrySet,
                        modelsByBaseName
                    )
                ) {
                    continue
                }
                diagnostics.push(
                    KicadPcmPackageQaReportBuilder.#diagnostic(
                        'kicad-pcm-package.missing-model',
                        'Package footprint references a 3D model not present under 3dmodels/.',
                        {
                            footprintPath: footprint.path,
                            footprintName: footprint.footprintName,
                            modelReference
                        }
                    )
                )
            }
        }

        return diagnostics
    }

    /**
     * Indexes package model entries by basename.
     * @param {string[]} modelEntries Packaged model entries.
     * @returns {Map<string, string[]>}
     */
    static #modelsByBaseName(modelEntries) {
        const index = new Map()
        for (const path of modelEntries) {
            const baseName = Utils.baseName(path)
            index.set(baseName, [...(index.get(baseName) || []), path])
        }
        return index
    }

    /**
     * Returns true when a model reference resolves to a packaged model entry.
     * @param {string} modelReference Footprint model reference.
     * @param {Set<string>} modelEntrySet Packaged model entries.
     * @param {Map<string, string[]>} modelsByBaseName Model entries by basename.
     * @returns {boolean}
     */
    static #modelReferenceResolved(
        modelReference,
        modelEntrySet,
        modelsByBaseName
    ) {
        for (const candidate of KicadPcmPackageQaReportBuilder.#modelCandidates(
            modelReference
        )) {
            if (modelEntrySet.has(candidate)) return true
        }

        const baseMatches =
            modelsByBaseName.get(Utils.baseName(modelReference)) || []
        return baseMatches.length === 1
    }

    /**
     * Builds package-relative model path candidates for one reference.
     * @param {string} modelReference Footprint model reference.
     * @returns {Set<string>}
     */
    static #modelCandidates(modelReference) {
        const normalized =
            KicadPcmPackageQaReportBuilder.#normalizeModelReference(
                modelReference
            )
        const candidates = new Set()
        if (!normalized) return candidates

        candidates.add(normalized)
        if (normalized.startsWith('${KIPRJMOD}/')) {
            candidates.add(normalized.slice('${KIPRJMOD}/'.length))
        }

        const variableMatch = /^\$\{[^}]+\}\/(.+)$/u.exec(normalized)
        if (variableMatch) candidates.add(variableMatch[1])

        const modelRootIndex = normalized.indexOf('3dmodels/')
        if (modelRootIndex >= 0) {
            const suffix = normalized.slice(modelRootIndex + '3dmodels/'.length)
            const suffixParts = suffix.split('/').filter(Boolean)
            candidates.add('3dmodels/' + suffix)
            if (suffixParts.length > 1) {
                candidates.add('3dmodels/' + suffixParts.slice(1).join('/'))
            }
        }

        return candidates
    }

    /**
     * Normalizes a footprint model reference for comparison.
     * @param {string} modelReference Footprint model reference.
     * @returns {string}
     */
    static #normalizeModelReference(modelReference) {
        const value = Utils.text(modelReference)
            .trim()
            .replace(/^"|"$/gu, '')
            .replace(/\\/gu, '/')
        return Utils.normalizeBasePath(value)
    }

    /**
     * Counts footprint model references.
     * @param {object[]} footprints Parsed footprint rows.
     * @returns {number}
     */
    static #modelReferenceCount(footprints) {
        return footprints.reduce(
            (count, footprint) => count + footprint.modelReferences.length,
            0
        )
    }

    /**
     * Builds one diagnostic row.
     * @param {string} code Diagnostic code.
     * @param {string} message Diagnostic message.
     * @param {object} [fields] Additional diagnostic fields.
     * @returns {object}
     */
    static #diagnostic(code, message, fields = {}) {
        const { error, ...rest } = fields
        return {
            severity: 'error',
            code,
            message,
            ...rest,
            ...(error
                ? {
                      error:
                          error instanceof Error ? error.message : String(error)
                  }
                : {})
        }
    }
}

/**
 * Removes the last extension from a file name.
 * @param {string} fileName Source file name.
 * @returns {string}
 */
function stripExtension(fileName) {
    return String(fileName || '').replace(/\.[^.]+$/u, '')
}
