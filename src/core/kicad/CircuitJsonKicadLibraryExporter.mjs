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
     * @param {{ projectName?: string, libraryName?: string, basePath?: string, modelFiles?: object[], includeModelEntries?: boolean, modelPathPrefix?: string, modelPathMode?: string, modelDirectory?: string, libraryTableRoot?: string, packageId?: string, packageName?: string, packageVersion?: string, packageDescription?: string, packageManagerLayout?: boolean, includeBuiltins?: boolean, dedupeLibraryItems?: boolean }} [options] Export options.
     * @returns {{ entries: { path: string, bytes: Uint8Array, contentType: string }[], diagnostics: object[], manifest: object, model3dSourcePaths: string[] }}
     */
    static export(circuitJson, options = {}) {
        const context = CircuitJsonKicadProjectContext.build(circuitJson, {
            projectName: options.projectName,
            libraryName: options.libraryName,
            modelFiles: options.modelFiles,
            modelPathPrefix: options.modelPathPrefix,
            modelPathMode:
                options.modelPathMode ||
                (options.packageManagerLayout === true
                    ? 'library-shapes'
                    : undefined),
            modelDirectory: options.modelDirectory,
            libraryTableRoot: options.libraryTableRoot,
            packageId: options.packageId
        })
        const libraryContext = CircuitJsonKicadLibraryExporter.#packagedContext(
            context,
            options
        )
        const basePath = Utils.normalizeBasePath(
            options.basePath ?? 'kicad-library'
        )
        const entries = CircuitJsonKicadLibraryExporter.#entries(
            libraryContext,
            basePath,
            options
        )
        const manifest = CircuitJsonKicadLibraryExporter.#manifest(
            entries,
            libraryContext,
            context,
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
     * @param {{ includeModelEntries?: boolean, packageManagerLayout?: boolean }} options Export options.
     * @returns {{ path: string, bytes: Uint8Array, contentType: string }[]}
     */
    static #entries(context, basePath, options) {
        const layout = CircuitJsonKicadLibraryExporter.#layout(context, options)
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
            Utils.sexprEntry(
                Utils.joinPath(basePath, 'fp-lib-table'),
                CircuitJsonKicadProjectFiles.fpLibTableNode(tableContext),
                'application/x-kicad-library-table'
            ),
            Utils.sexprEntry(
                Utils.joinPath(basePath, 'sym-lib-table'),
                CircuitJsonKicadProjectFiles.symLibTableNode(tableContext),
                'application/x-kicad-library-table'
            ),
            ...(options.includeModelEntries === false
                ? []
                : CircuitJsonKicadProjectFiles.modelEntries(
                      context.modelFiles,
                      basePath,
                      context.modelDirectory
                  )),
            ...(options.packageManagerLayout === true
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
     * @param {{ packageManagerLayout?: boolean }} options Export options.
     * @returns {{ symbolLibraryPath: string, footprintBasePath: string, footprintLibraryPath: string }}
     */
    static #layout(context, options) {
        const symbolLibraryPath = context.libraryName + '.kicad_sym'
        const footprintLibraryPath = context.libraryName + '.pretty'
        if (options.packageManagerLayout !== true) {
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
        const modelDirectories = context.modelFiles.length
            ? [context.modelDirectory]
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
