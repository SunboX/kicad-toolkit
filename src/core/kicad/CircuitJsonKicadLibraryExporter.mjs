// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectContext } from './CircuitJsonKicadProjectContext.mjs'
import { CircuitJsonKicadProjectFiles } from './CircuitJsonKicadProjectFiles.mjs'
import { CircuitJsonKicadProjectMetadata as Metadata } from './CircuitJsonKicadProjectMetadata.mjs'
import { CircuitJsonKicadProjectPcbBuilder } from './CircuitJsonKicadProjectPcbBuilder.mjs'
import { CircuitJsonKicadProjectSchematicBuilder } from './CircuitJsonKicadProjectSchematicBuilder.mjs'
import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

/**
 * Exports CircuitJSON element arrays as reusable KiCad library files.
 */
export class CircuitJsonKicadLibraryExporter {
    /**
     * Builds archive-ready KiCad library entries from a CircuitJSON source.
     * @param {object[] | { circuitJson?: object[], elements?: object[] }} circuitJson CircuitJSON source.
     * @param {{ projectName?: string, libraryName?: string, basePath?: string, modelFiles?: object[], modelSourceRules?: object[], includeModelEntries?: boolean, modelPathPrefix?: string, modelPathMode?: string, modelDirectory?: string, libraryTableRoot?: string, packageId?: string, packageName?: string, packageVersion?: string, packageDescription?: string, packageDescriptionFull?: string, packageManagerLayout?: boolean, pcmPackage?: boolean, packageSchemaVersion?: string | number, packageAuthor?: string | object, packageMaintainer?: string | object, packageAuthorName?: string, packageMaintainerName?: string, packageLicense?: string, packageTags?: string[], packageStatus?: string, packageKicadVersion?: string, packageResources?: object, packageHomepage?: string, packageRepository?: string, packageIssues?: string, packageThirdPartyRoot?: string, packageLibraryPrefix?: string, includeBuiltins?: boolean, dedupeLibraryItems?: boolean, schematicScaleFactor?: number }} [options] Export options.
     * @returns {{ entries: { path: string, bytes: Uint8Array, contentType: string }[], diagnostics: object[], manifest: object, model3dSourcePaths: string[] }}
     */
    static export(circuitJson, options = {}) {
        const useSplitLayout =
            CircuitJsonKicadLibraryExporter.#usesSplitPackageLayout(options)
        const context = CircuitJsonKicadProjectContext.build(circuitJson, {
            projectName: options.projectName,
            libraryName: options.libraryName,
            modelFiles: options.modelFiles,
            modelSourceRules: options.modelSourceRules,
            modelPathPrefix: options.modelPathPrefix,
            modelPathMode:
                options.modelPathMode ||
                (useSplitLayout ? 'library-shapes' : undefined),
            modelDirectory: options.modelDirectory,
            libraryTableRoot: options.libraryTableRoot,
            packageId: options.packageId,
            schematicScaleFactor: options.schematicScaleFactor
        })
        const exportContext = CircuitJsonKicadLibraryExporter.#exportContext(
            context,
            options
        )
        const libraryContext = CircuitJsonKicadLibraryExporter.#packagedContext(
            exportContext,
            options
        )
        const basePath = CircuitJsonKicadLibraryExporter.#basePath(options)
        const entries = CircuitJsonKicadLibraryExporter.#entries(
            libraryContext,
            basePath,
            options
        )
        const manifest = CircuitJsonKicadLibraryExporter.#manifest(
            entries,
            libraryContext,
            exportContext,
            options
        )

        return {
            entries,
            diagnostics: [],
            manifest,
            model3dSourcePaths: manifest.model3dSourcePaths
        }
    }

    /**
     * Builds sorted library archive entries.
     * @param {object} context Export context.
     * @param {string} basePath Archive base path.
     * @param {{ includeModelEntries?: boolean, packageManagerLayout?: boolean, pcmPackage?: boolean }} options Export options.
     * @returns {{ path: string, bytes: Uint8Array, contentType: string }[]}
     */
    static #entries(context, basePath, options) {
        const layout = CircuitJsonKicadLibraryExporter.#layout(context, options)
        const isPcmPackage =
            CircuitJsonKicadLibraryExporter.#isPcmPackage(options)
        const tableContext = {
            ...context,
            footprintLibraryTablePath: layout.footprintLibraryPath,
            symbolLibraryTablePath: layout.symbolLibraryPath
        }
        return [
            Utils.sexprEntry(
                Utils.joinPath(basePath, layout.symbolLibraryPath),
                CircuitJsonKicadProjectSchematicBuilder.buildSymbolLibrary(
                    context
                ),
                'application/x-kicad-symbol-library'
            ),
            ...CircuitJsonKicadProjectPcbBuilder.footprintEntries(
                context,
                Utils.joinPath(basePath, layout.footprintBasePath)
            ),
            ...(isPcmPackage
                ? []
                : [
                      Utils.sexprEntry(
                          Utils.joinPath(basePath, 'fp-lib-table'),
                          CircuitJsonKicadProjectFiles.fpLibTableNode(
                              tableContext
                          ),
                          'application/x-kicad-library-table'
                      ),
                      Utils.sexprEntry(
                          Utils.joinPath(basePath, 'sym-lib-table'),
                          CircuitJsonKicadProjectFiles.symLibTableNode(
                              tableContext
                          ),
                          'application/x-kicad-library-table'
                      )
                  ]),
            ...(options.includeModelEntries === false
                ? []
                : CircuitJsonKicadProjectFiles.modelEntries(
                      context.modelFiles,
                      basePath,
                      context.modelDirectory
                  )),
            ...(options.packageManagerLayout === true || isPcmPackage
                ? [
                      Utils.jsonEntry(
                          Utils.joinPath(basePath, 'metadata.json'),
                          CircuitJsonKicadLibraryExporter.#packageMetadata(
                              context,
                              layout,
                              options
                          )
                      )
                  ]
                : [])
        ].sort((left, right) => left.path.localeCompare(right.path))
    }

    /**
     * Resolves archive-relative library paths for the requested layout.
     * @param {object} context Export context.
     * @param {{ packageManagerLayout?: boolean, pcmPackage?: boolean }} options Export options.
     * @returns {{ symbolLibraryPath: string, footprintBasePath: string, footprintLibraryPath: string }}
     */
    static #layout(context, options) {
        const symbolLibraryPath = context.libraryName + '.kicad_sym'
        const footprintLibraryPath = context.libraryName + '.pretty'
        if (!CircuitJsonKicadLibraryExporter.#usesSplitPackageLayout(options)) {
            return {
                symbolLibraryPath,
                footprintBasePath: '',
                footprintLibraryPath
            }
        }
        return {
            symbolLibraryPath: 'symbols/' + symbolLibraryPath,
            footprintBasePath: 'footprints',
            footprintLibraryPath: 'footprints/' + footprintLibraryPath
        }
    }

    /**
     * Builds package-manager metadata for a split library bundle.
     * @param {object} context Export context.
     * @param {{ symbolLibraryPath: string, footprintLibraryPath: string }} layout Layout paths.
     * @param {object} options Export options.
     * @returns {object}
     */
    static #packageMetadata(context, layout, options) {
        if (CircuitJsonKicadLibraryExporter.#isPcmPackage(options)) {
            return CircuitJsonKicadLibraryExporter.#pcmPackageMetadata(
                context,
                options
            )
        }
        const modelDirectories = context.modelFiles.length
            ? context.modelDirectories || [context.modelDirectory]
            : []
        return {
            schema: 'kicad-toolkit.package-manager-metadata.a1',
            identifier: Utils.text(options.packageId, context.libraryName),
            name: Utils.text(options.packageName, context.libraryName),
            version: Utils.text(options.packageVersion, '0.0.0'),
            description: Utils.text(options.packageDescription),
            resources: {
                symbols: [layout.symbolLibraryPath],
                footprints: [layout.footprintLibraryPath],
                models3d: modelDirectories
            }
        }
    }

    /**
     * Builds official package-manager metadata for an installable library zip.
     * @param {object} context Export context.
     * @param {object} options Export options.
     * @returns {object}
     */
    static #pcmPackageMetadata(context, options) {
        const description = Utils.text(options.packageDescription)
        return {
            $schema:
                'https://go.kicad.org/pcm/schemas/v' +
                CircuitJsonKicadLibraryExporter.#pcmSchemaVersion(options),
            type: 'library',
            identifier: Utils.text(options.packageId, context.libraryName),
            name: Utils.text(options.packageName, context.libraryName),
            description,
            description_full: Utils.text(
                options.packageDescriptionFull,
                description
            ),
            author: CircuitJsonKicadLibraryExporter.#pcmPerson(
                options.packageAuthor,
                Utils.text(options.packageAuthorName, 'Unspecified')
            ),
            maintainer: CircuitJsonKicadLibraryExporter.#pcmPerson(
                options.packageMaintainer,
                Utils.text(options.packageMaintainerName, 'Unspecified')
            ),
            license: Utils.text(options.packageLicense, 'unrestricted'),
            resources:
                CircuitJsonKicadLibraryExporter.#pcmPackageResources(options),
            tags: CircuitJsonKicadLibraryExporter.#pcmTags(options),
            versions: [
                CircuitJsonKicadLibraryExporter.#pcmVersionMetadata(options)
            ]
        }
    }

    /**
     * Builds one package-manager version record.
     * @param {object} options Export options.
     * @returns {{ version: string, status: string, kicad_version: string }}
     */
    static #pcmVersionMetadata(options) {
        return {
            version: Utils.text(options.packageVersion, '0.0.0'),
            status: Utils.text(options.packageStatus, 'stable'),
            kicad_version:
                CircuitJsonKicadLibraryExporter.#pcmKicadVersion(options)
        }
    }

    /**
     * Normalizes a package-manager person object.
     * @param {unknown} value Candidate person value.
     * @param {string} fallbackName Fallback person name.
     * @returns {{ name: string, contact: object }}
     */
    static #pcmPerson(value, fallbackName) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const person = {
                ...value,
                name: Utils.text(value.name, fallbackName)
            }
            if (
                !person.contact ||
                typeof person.contact !== 'object' ||
                Array.isArray(person.contact)
            ) {
                person.contact = {}
            }
            return person
        }

        return {
            name: Utils.text(value, fallbackName),
            contact: {}
        }
    }

    /**
     * Builds optional package-manager resource links.
     * @param {object} options Export options.
     * @returns {object}
     */
    static #pcmPackageResources(options) {
        if (
            options.packageResources &&
            typeof options.packageResources === 'object' &&
            !Array.isArray(options.packageResources)
        ) {
            return { ...options.packageResources }
        }

        return Object.fromEntries(
            [
                ['homepage', options.packageHomepage],
                ['repository', options.packageRepository],
                ['issues', options.packageIssues]
            ]
                .map(([key, value]) => [key, Utils.text(value)])
                .filter(([, value]) => value)
        )
    }

    /**
     * Resolves package-manager metadata tags.
     * @param {object} options Export options.
     * @returns {string[]}
     */
    static #pcmTags(options) {
        if (Array.isArray(options.packageTags)) {
            return options.packageTags
                .map((tag) => Utils.text(tag))
                .filter(Boolean)
        }
        return ['library']
    }

    /**
     * Resolves the package-manager schema version suffix.
     * @param {object} options Export options.
     * @returns {string}
     */
    static #pcmSchemaVersion(options) {
        const normalized = Utils.text(options.packageSchemaVersion, '2')
            .trim()
            .replace(/^v/iu, '')
        return /^\d+$/u.test(normalized) ? normalized : '2'
    }

    /**
     * Resolves the target KiCad version for the package-manager metadata.
     * @param {object} options Export options.
     * @returns {string}
     */
    static #pcmKicadVersion(options) {
        return Utils.text(options.packageKicadVersion, '10.0')
    }

    /**
     * Builds the export context for package-specific references.
     * @param {object} context Base export context.
     * @param {object} options Export options.
     * @returns {object}
     */
    static #exportContext(context, options) {
        if (!CircuitJsonKicadLibraryExporter.#isPcmPackage(options)) {
            return context
        }

        return {
            ...context,
            modelPathPrefix:
                options.modelPathPrefix ||
                CircuitJsonKicadLibraryExporter.#pcmModelPathPrefix(
                    context,
                    options
                ),
            footprintReferenceLibraryPrefix: Utils.text(
                options.packageLibraryPrefix,
                'PCM_'
            )
        }
    }

    /**
     * Resolves the archive base path.
     * @param {object} options Export options.
     * @returns {string}
     */
    static #basePath(options) {
        if (CircuitJsonKicadLibraryExporter.#isPcmPackage(options)) return ''
        return Utils.normalizeBasePath(options.basePath ?? 'kicad-library')
    }

    /**
     * Returns true when the export should use installable package metadata.
     * @param {object} options Export options.
     * @returns {boolean}
     */
    static #isPcmPackage(options) {
        return options.pcmPackage === true
    }

    /**
     * Returns true when the export should use package subdirectories.
     * @param {object} options Export options.
     * @returns {boolean}
     */
    static #usesSplitPackageLayout(options) {
        return (
            options.packageManagerLayout === true ||
            CircuitJsonKicadLibraryExporter.#isPcmPackage(options)
        )
    }

    /**
     * Builds the installed-package 3D model reference prefix.
     * @param {object} context Export context.
     * @param {object} options Export options.
     * @returns {string}
     */
    static #pcmModelPathPrefix(context, options) {
        return (
            CircuitJsonKicadLibraryExporter.#pcmThirdPartyRoot(options) +
            '/3dmodels/' +
            CircuitJsonKicadLibraryExporter.#pcmPackageInstallId(
                context,
                options
            ) +
            '/' +
            CircuitJsonKicadLibraryExporter.#pcmModelDirectoryName(context) +
            '/'
        )
    }

    /**
     * Resolves the third-party variable root for installed model paths.
     * @param {object} options Export options.
     * @returns {string}
     */
    static #pcmThirdPartyRoot(options) {
        const explicit = Utils.text(options.packageThirdPartyRoot)
        if (explicit) return explicit.replace(/\/+$/gu, '')
        const majorMatch = /\d+/u.exec(
            CircuitJsonKicadLibraryExporter.#pcmKicadVersion(options)
        )
        const major = majorMatch ? majorMatch[0] : '10'
        return '${KICAD' + major + '_3RD_PARTY}'
    }

    /**
     * Resolves the installed package directory token.
     * @param {object} context Export context.
     * @param {object} options Export options.
     * @returns {string}
     */
    static #pcmPackageInstallId(context, options) {
        return Utils.safeName(
            Utils.text(options.packageId, context.libraryName)
        ).replace(/\./gu, '_')
    }

    /**
     * Resolves the model directory name beneath the installed package root.
     * @param {object} context Export context.
     * @returns {string}
     */
    static #pcmModelDirectoryName(context) {
        const directory = Utils.normalizeBasePath(context.modelDirectory)
        const modelRoot = '3dmodels/'
        return directory.startsWith(modelRoot)
            ? directory.slice(modelRoot.length)
            : directory
    }

    /**
     * Builds the package-specific context view.
     * @param {object} context Export context.
     * @param {object} options Export options.
     * @returns {object}
     */
    static #packagedContext(context, options) {
        return {
            ...context,
            symbolRows: CircuitJsonKicadLibraryExporter.#selectedRows(
                context.componentRows,
                Metadata.isBuiltinSymbol,
                (row) => row.symbolName,
                options
            ),
            footprintRows: CircuitJsonKicadLibraryExporter.#selectedRows(
                context.footprintRows,
                Metadata.isBuiltinFootprint,
                (row) => row.footprintName,
                options
            )
        }
    }

    /**
     * Filters and optionally deduplicates library rows.
     * @param {object[]} rows Candidate rows.
     * @param {(row: object) => boolean} isBuiltin Builtin predicate.
     * @param {(row: object) => string} keyFor Key resolver.
     * @param {object} options Export options.
     * @returns {object[]}
     */
    static #selectedRows(rows, isBuiltin, keyFor, options) {
        const includeBuiltins = options.includeBuiltins !== false
        const selected = includeBuiltins
            ? [...rows]
            : rows.filter((row) => !isBuiltin(row))
        if (options.dedupeLibraryItems !== true) return selected
        return CircuitJsonKicadLibraryExporter.#uniqueRows(selected, keyFor)
    }

    /**
     * Deduplicates rows by a case-insensitive key.
     * @param {object[]} rows Candidate rows.
     * @param {(row: object) => string} keyFor Key resolver.
     * @returns {object[]}
     */
    static #uniqueRows(rows, keyFor) {
        const seen = new Set()
        const unique = []

        for (const row of rows) {
            const key = Utils.text(keyFor(row)).toLowerCase()
            if (!key || seen.has(key)) continue
            seen.add(key)
            unique.push(row)
        }

        return unique
    }

    /**
     * Builds the library export manifest.
     * @param {{ path: string }[]} entries Archive entries.
     * @param {object} context Packaged export context.
     * @param {object} sourceContext Source export context.
     * @param {object} options Export options.
     * @returns {object}
     */
    static #manifest(entries, context, sourceContext, options) {
        return {
            schema: 'kicad-toolkit.circuit-json-kicad-library-export.a1',
            libraryName: context.libraryName,
            packageId: Utils.text(options.packageId),
            libraryTableRoot: context.libraryTableRoot,
            files: entries.map((entry) => entry.path),
            modelDirectory: context.modelDirectory,
            modelDirectories: context.modelDirectories || [],
            model3dSourcePaths: context.modelFiles
                .map((model) => model.sourcePath)
                .filter(Boolean),
            package: CircuitJsonKicadLibraryExporter.#packageManifest(
                sourceContext,
                options
            )
        }
    }

    /**
     * Builds local and external package classification metadata.
     * @param {object} context Source export context.
     * @param {object} options Export options.
     * @returns {object}
     */
    static #packageManifest(context, options) {
        return {
            includeBuiltins: options.includeBuiltins !== false,
            dedupeLibraryItems: options.dedupeLibraryItems === true,
            pcmPackage: CircuitJsonKicadLibraryExporter.#isPcmPackage(options),
            symbols: {
                local: CircuitJsonKicadLibraryExporter.#classificationRows(
                    context,
                    context.componentRows,
                    Metadata.isBuiltinSymbol,
                    Metadata.symbolManifestRow,
                    false,
                    options
                ),
                builtin: CircuitJsonKicadLibraryExporter.#classificationRows(
                    context,
                    context.componentRows,
                    Metadata.isBuiltinSymbol,
                    Metadata.symbolManifestRow,
                    true,
                    options
                )
            },
            footprints: {
                local: CircuitJsonKicadLibraryExporter.#classificationRows(
                    context,
                    context.footprintRows,
                    Metadata.isBuiltinFootprint,
                    Metadata.footprintManifestRow,
                    false,
                    options
                ),
                builtin: CircuitJsonKicadLibraryExporter.#classificationRows(
                    context,
                    context.footprintRows,
                    Metadata.isBuiltinFootprint,
                    Metadata.footprintManifestRow,
                    true,
                    options
                )
            },
            rewrites: context.componentRows.map((row) => ({
                sourceId: row.sourceId,
                symbolLibId: Metadata.symbolLibId(context, row),
                footprintLibId: Metadata.footprintLibId(context, row)
            }))
        }
    }

    /**
     * Builds manifest classification rows.
     * @param {object} context Export context.
     * @param {object[]} rows Candidate rows.
     * @param {(row: object) => boolean} isBuiltin Builtin predicate.
     * @param {(context: object, row: object) => object} toManifest Manifest mapper.
     * @param {boolean} builtin Desired builtin state.
     * @param {object} options Export options.
     * @returns {object[]}
     */
    static #classificationRows(
        context,
        rows,
        isBuiltin,
        toManifest,
        builtin,
        options
    ) {
        const selected = rows.filter((row) => isBuiltin(row) === builtin)
        const unique =
            options.dedupeLibraryItems === true
                ? CircuitJsonKicadLibraryExporter.#uniqueRows(
                      selected,
                      (row) => toManifest(context, row).name
                  )
                : selected
        return unique.map((row) => toManifest(context, row))
    }
}
