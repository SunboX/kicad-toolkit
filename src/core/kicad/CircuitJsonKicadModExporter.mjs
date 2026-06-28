// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectContext } from './CircuitJsonKicadProjectContext.mjs'
import { CircuitJsonKicadProjectPcbBuilder } from './CircuitJsonKicadProjectPcbBuilder.mjs'
import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

/**
 * Exports one Circuit JSON footprint row as a standalone KiCad footprint file.
 */
export class CircuitJsonKicadModExporter {
    /**
     * Builds a standalone `.kicad_mod` export entry from a Circuit JSON source.
     * @param {object[] | { circuitJson?: object[], elements?: object[] }} circuitJson Circuit JSON source.
     * @param {{ projectName?: string, libraryName?: string, basePath?: string, fileName?: string, footprintName?: string, sourceComponentId?: string, pcbComponentId?: string, index?: number, modelFiles?: object[], modelSourceRules?: object[], modelPathPrefix?: string, modelPathMode?: string, modelDirectory?: string, libraryTableRoot?: string, packageId?: string }} [options] Export options.
     * @returns {{ entry: { path: string, bytes: Uint8Array, contentType: string } | null, diagnostics: object[], manifest: object }}
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
            packageId: options.packageId
        })
        const row = CircuitJsonKicadModExporter.#selectedRow(context, options)
        if (!row) {
            return CircuitJsonKicadModExporter.#missingResult(options)
        }

        const path = CircuitJsonKicadModExporter.#entryPath(row, options)
        const entry = Utils.sexprEntry(
            path,
            CircuitJsonKicadProjectPcbBuilder.footprintNode(context, row, {
                placed: false
            }),
            'application/x-kicad-footprint'
        )

        return {
            entry,
            diagnostics: [],
            manifest: CircuitJsonKicadModExporter.#manifest(row, entry)
        }
    }

    /**
     * Builds standalone `.kicad_mod` text from a Circuit JSON source.
     * @param {object[] | { circuitJson?: object[], elements?: object[] }} circuitJson Circuit JSON source.
     * @param {object} [options] Export options.
     * @returns {string}
     */
    static exportText(circuitJson, options = {}) {
        const result = CircuitJsonKicadModExporter.export(circuitJson, options)
        if (!result.entry) return ''
        return new TextDecoder().decode(result.entry.bytes)
    }

    /**
     * Selects the footprint row requested by export options.
     * @param {object} context Export context.
     * @param {object} options Export options.
     * @returns {object | null}
     */
    static #selectedRow(context, options) {
        const rows = context.footprintRows || []
        if (!rows.length) return null

        const sourceComponentId = Utils.text(
            options.sourceComponentId || options.source_component_id
        )
        if (sourceComponentId) {
            return (
                rows.find((row) => row.sourceId === sourceComponentId) || null
            )
        }

        const pcbComponentId = Utils.text(
            options.pcbComponentId || options.pcb_component_id
        )
        if (pcbComponentId) {
            return (
                rows.find(
                    (row) =>
                        Utils.text(row.pcbComponent?.pcb_component_id) ===
                        pcbComponentId
                ) || null
            )
        }

        const footprintName = Utils.text(
            options.footprintName || options.footprint_name
        )
        if (footprintName) {
            return (
                rows.find((row) => row.footprintName === footprintName) || null
            )
        }

        const index = Number.isInteger(options.index) ? options.index : 0
        return rows[index] || null
    }

    /**
     * Builds the output archive path for one footprint.
     * @param {object} row Footprint row.
     * @param {object} options Export options.
     * @returns {string}
     */
    static #entryPath(row, options) {
        const basePath = Utils.normalizeBasePath(options.basePath ?? 'kicad')
        const fileName = Utils.text(
            options.fileName || options.file_name,
            row.footprintName + '.kicad_mod'
        )
        return Utils.joinPath(basePath, fileName)
    }

    /**
     * Builds the standalone footprint export manifest.
     * @param {object} row Footprint row.
     * @param {{ path: string }} entry Export entry.
     * @returns {object}
     */
    static #manifest(row, entry) {
        return {
            schema: 'kicad-toolkit.circuit-json-kicad-mod-export.a1',
            footprintName: row.footprintName,
            sourceId: row.sourceId,
            file: entry.path
        }
    }

    /**
     * Builds a missing-footprint result without throwing.
     * @param {object} options Export options.
     * @returns {{ entry: null, diagnostics: object[], manifest: object }}
     */
    static #missingResult(options) {
        return {
            entry: null,
            diagnostics: [
                {
                    severity: 'error',
                    code: 'circuit_json_footprint_missing',
                    message:
                        'No Circuit JSON footprint row matched the export request.'
                }
            ],
            manifest: {
                schema: 'kicad-toolkit.circuit-json-kicad-mod-export.a1',
                footprintName: Utils.text(
                    options.footprintName || options.footprint_name
                ),
                sourceId: Utils.text(
                    options.sourceComponentId || options.source_component_id
                ),
                file: ''
            }
        }
    }
}
