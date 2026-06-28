// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectContext } from './CircuitJsonKicadProjectContext.mjs'
import { CircuitJsonKicadProjectFiles } from './CircuitJsonKicadProjectFiles.mjs'
import { CircuitJsonKicadProjectPcbBuilder } from './CircuitJsonKicadProjectPcbBuilder.mjs'
import { CircuitJsonKicadProjectSchematicBuilder } from './CircuitJsonKicadProjectSchematicBuilder.mjs'
import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

/**
 * Exports CircuitJSON element arrays as a minimal KiCad project bundle.
 */
export class CircuitJsonKicadProjectExporter {
    /**
     * Builds archive-ready KiCad project entries from a CircuitJSON source.
     * @param {object[] | { circuitJson?: object[], elements?: object[] }} circuitJson CircuitJSON source.
     * @param {{ projectName?: string, libraryName?: string, basePath?: string, modelFiles?: object[], modelSourceRules?: object[], includeModelEntries?: boolean, modelPathPrefix?: string, modelPathMode?: string, modelDirectory?: string, libraryTableRoot?: string, packageId?: string, useGenericConnectorSymbols?: boolean, schematicScaleFactor?: number, schematicCenterOnPage?: boolean }} [options] Export options.
     * @returns {{ entries: { path: string, bytes: Uint8Array, contentType: string }[], diagnostics: object[], manifest: object, model3dSourcePaths: string[] }}
     */
    static export(circuitJson, options = {}) {
        const context = CircuitJsonKicadProjectContext.build(circuitJson, {
            projectName: options.projectName,
            libraryName: options.libraryName,
            modelFiles: options.modelFiles,
            modelSourceRules: options.modelSourceRules,
            modelPathPrefix: options.modelPathPrefix,
            modelPathMode: options.modelPathMode,
            modelDirectory: options.modelDirectory,
            libraryTableRoot: options.libraryTableRoot,
            packageId: options.packageId,
            useGenericConnectorSymbols: options.useGenericConnectorSymbols,
            schematicScaleFactor: options.schematicScaleFactor,
            schematicCenterOnPage: options.schematicCenterOnPage
        })
        const basePath = Utils.normalizeBasePath(options.basePath ?? 'kicad')
        const entries = CircuitJsonKicadProjectExporter.#entries(
            context,
            basePath,
            options
        )
        const manifest = CircuitJsonKicadProjectFiles.manifest(entries, context)

        return {
            entries,
            diagnostics: [],
            manifest,
            model3dSourcePaths: manifest.model3dSourcePaths
        }
    }

    /**
     * Builds sorted archive entries.
     * @param {object} context Export context.
     * @param {string} basePath Archive base path.
     * @param {{ includeModelEntries?: boolean }} options Export options.
     * @returns {{ path: string, bytes: Uint8Array, contentType: string }[]}
     */
    static #entries(context, basePath, options) {
        return [
            Utils.jsonEntry(
                Utils.joinPath(basePath, context.projectName + '.kicad_pro'),
                CircuitJsonKicadProjectFiles.projectJson(context)
            ),
            Utils.sexprEntry(
                Utils.joinPath(basePath, context.projectName + '.kicad_sch'),
                CircuitJsonKicadProjectSchematicBuilder.buildSchematic(context),
                'application/x-kicad-schematic'
            ),
            Utils.sexprEntry(
                Utils.joinPath(basePath, context.projectName + '.kicad_pcb'),
                CircuitJsonKicadProjectPcbBuilder.buildPcb(context),
                'application/x-kicad-pcb'
            ),
            Utils.sexprEntry(
                Utils.joinPath(basePath, context.libraryName + '.kicad_sym'),
                CircuitJsonKicadProjectSchematicBuilder.buildSymbolLibrary(
                    context
                ),
                'application/x-kicad-symbol-library'
            ),
            ...CircuitJsonKicadProjectPcbBuilder.footprintEntries(
                context,
                basePath
            ),
            Utils.sexprEntry(
                Utils.joinPath(basePath, 'fp-lib-table'),
                CircuitJsonKicadProjectFiles.fpLibTableNode(context),
                'application/x-kicad-library-table'
            ),
            Utils.sexprEntry(
                Utils.joinPath(basePath, 'sym-lib-table'),
                CircuitJsonKicadProjectFiles.symLibTableNode(context),
                'application/x-kicad-library-table'
            ),
            ...(options.includeModelEntries === false
                ? []
                : CircuitJsonKicadProjectFiles.modelEntries(
                      context.modelFiles,
                      basePath,
                      context.modelDirectory
                  ))
        ].sort((left, right) => left.path.localeCompare(right.path))
    }
}
