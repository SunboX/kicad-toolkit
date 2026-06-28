// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'
import { CircuitJsonKicadProjectModelRouting as ModelRouting } from './CircuitJsonKicadProjectModelRouting.mjs'

/**
 * Builds non-layout KiCad project files and archive metadata.
 */
export class CircuitJsonKicadProjectFiles {
    /**
     * Builds a minimal KiCad project JSON object.
     * @param {object} context Export context.
     * @returns {object}
     */
    static projectJson(context) {
        const board = context.board || {}
        const minViaDiameter = Utils.number(board.min_via_pad_diameter, 0.6)
        const minViaDrill = Utils.number(board.min_via_hole_diameter, 0.3)
        const minTrackWidth = Utils.number(board.min_trace_width, 0.18)
        const defaultNetClass = {
            name: 'Default',
            track_width: minTrackWidth,
            via_diameter: minViaDiameter,
            via_drill: minViaDrill,
            clearance: Utils.number(board.min_trace_to_pad_edge_clearance, 0.1)
        }

        return {
            version: 1,
            head: {
                generator: 'ecad_forge',
                generator_version: '1',
                project_name: context.projectName
            },
            meta: { version: 1 },
            text_variables: {},
            libraries: {
                pinned_symbol_libs: [],
                pinned_footprint_libs: []
            },
            boards: [],
            schematic: {
                meta: { version: 1 },
                page_layout_descr_file: '',
                last_opened_files: [context.projectName + '.kicad_sch']
            },
            board: {
                meta: { version: 1 },
                design_settings: {
                    rules: {
                        min_via_diameter: minViaDiameter,
                        min_via_annular_width:
                            (minViaDiameter - minViaDrill) / 2,
                        min_through_hole_diameter: minViaDrill,
                        min_track_width: minTrackWidth
                    }
                },
                last_opened_board: context.projectName + '.kicad_pcb'
            },
            net_settings: {
                meta: { version: 1 },
                last_net_id: context.netMap.size,
                classes: CircuitJsonKicadProjectFiles.netClasses(
                    context,
                    defaultNetClass
                )
            },
            sheets: [[Utils.uuid('sheet:root'), 'Root']]
        }
    }

    /**
     * Builds project net classes from board defaults and source-net rules.
     * @param {object} context Export context.
     * @param {object} defaultNetClass Default net-class settings.
     * @returns {object[]}
     */
    static netClasses(context, defaultNetClass) {
        const rowsByName = new Map([[defaultNetClass.name, defaultNetClass]])
        const sourceNets = Array.from(context.sourceNets?.values?.() || [])
            .filter(Boolean)
            .sort((left, right) =>
                CircuitJsonKicadProjectFiles.#sourceNetName(left).localeCompare(
                    CircuitJsonKicadProjectFiles.#sourceNetName(right)
                )
            )

        for (const sourceNet of sourceNets) {
            const row = CircuitJsonKicadProjectFiles.#sourceNetClass(sourceNet)
            if (!row) continue
            const existing = rowsByName.get(row.name)
            if (existing) {
                CircuitJsonKicadProjectFiles.#mergeNetClass(existing, row)
                continue
            }
            rowsByName.set(row.name, row)
        }

        return Array.from(rowsByName.values())
    }

    /**
     * Builds one net class from source-net rule fields.
     * @param {object} sourceNet Source-net element.
     * @returns {object | null}
     */
    static #sourceNetClass(sourceNet) {
        const netName = CircuitJsonKicadProjectFiles.#sourceNetName(sourceNet)
        const className = CircuitJsonKicadProjectFiles.#netClassName(
            sourceNet,
            netName
        )
        const row = {
            name: className
        }

        CircuitJsonKicadProjectFiles.#assignNumber(row, 'track_width', [
            sourceNet.track_width,
            sourceNet.trackWidth,
            sourceNet.trace_width,
            sourceNet.traceWidth,
            sourceNet.min_trace_width,
            sourceNet.minTraceWidth
        ])
        CircuitJsonKicadProjectFiles.#assignNumber(row, 'clearance', [
            sourceNet.clearance,
            sourceNet.min_clearance,
            sourceNet.minClearance,
            sourceNet.trace_clearance,
            sourceNet.traceClearance
        ])
        CircuitJsonKicadProjectFiles.#assignNumber(row, 'via_diameter', [
            sourceNet.via_diameter,
            sourceNet.viaDiameter,
            sourceNet.min_via_diameter,
            sourceNet.minViaDiameter,
            sourceNet.min_via_pad_diameter,
            sourceNet.minViaPadDiameter
        ])
        CircuitJsonKicadProjectFiles.#assignNumber(row, 'via_drill', [
            sourceNet.via_drill,
            sourceNet.viaDrill,
            sourceNet.min_via_drill,
            sourceNet.minViaDrill,
            sourceNet.min_via_hole_diameter,
            sourceNet.minViaHoleDiameter
        ])
        CircuitJsonKicadProjectFiles.#assignNumber(row, 'diff_pair_gap', [
            sourceNet.diff_pair_gap,
            sourceNet.diffPairGap
        ])
        CircuitJsonKicadProjectFiles.#assignNumber(row, 'diff_pair_width', [
            sourceNet.diff_pair_width,
            sourceNet.diffPairWidth
        ])

        const hasSettings = Object.keys(row).length > 1
        if (!hasSettings && className === netName) return null
        if (netName) row.nets = [netName]
        return row
    }

    /**
     * Resolves a source-net display name.
     * @param {object} sourceNet Source-net element.
     * @returns {string}
     */
    static #sourceNetName(sourceNet) {
        return Utils.text(
            sourceNet.raw_name || sourceNet.name || sourceNet.source_net_id
        )
    }

    /**
     * Resolves a source-net class name.
     * @param {object} sourceNet Source-net element.
     * @param {string} netName Fallback net name.
     * @returns {string}
     */
    static #netClassName(sourceNet, netName) {
        return Utils.text(
            sourceNet.net_class ||
                sourceNet.netClass ||
                sourceNet.net_class_name ||
                sourceNet.netClassName ||
                sourceNet.class_name ||
                sourceNet.className,
            netName
        )
    }

    /**
     * Assigns the first finite numeric field to a KiCad net-class row.
     * @param {object} row Net-class row.
     * @param {string} name Target property name.
     * @param {unknown[]} values Candidate values.
     * @returns {void}
     */
    static #assignNumber(row, name, values) {
        for (const value of values) {
            const number = Utils.number(value, NaN)
            if (!Number.isFinite(number)) continue
            row[name] = number
            return
        }
    }

    /**
     * Merges matching net-class rows without overwriting existing constraints.
     * @param {object} target Existing net-class row.
     * @param {object} source Source net-class row.
     * @returns {void}
     */
    static #mergeNetClass(target, source) {
        for (const [key, value] of Object.entries(source)) {
            if (key === 'name') continue
            if (key === 'nets') {
                target.nets = CircuitJsonKicadProjectFiles.#mergedTextList(
                    target.nets,
                    value
                )
                continue
            }
            if (!Object.hasOwn(target, key)) target[key] = value
        }
    }

    /**
     * Merges text list values while preserving first-seen order.
     * @param {string[] | undefined} target Existing text list.
     * @param {string[] | undefined} source Source text list.
     * @returns {string[]}
     */
    static #mergedTextList(target, source) {
        return Array.from(new Set([...(target || []), ...(source || [])]))
    }

    /**
     * Builds the footprint library table node.
     * @param {object} context Export context.
     * @returns {Array}
     */
    static fpLibTableNode(context) {
        const libraryPath =
            context.footprintLibraryTablePath || context.libraryName + '.pretty'
        return [
            'fp_lib_table',
            [
                'lib',
                ['name', context.libraryName],
                ['type', 'KiCad'],
                ['uri', context.libraryTableRoot + '/' + libraryPath],
                ['options', ''],
                ['descr', '']
            ]
        ]
    }

    /**
     * Builds the symbol library table node.
     * @param {object} context Export context.
     * @returns {Array}
     */
    static symLibTableNode(context) {
        const libraryPath =
            context.symbolLibraryTablePath || context.libraryName + '.kicad_sym'
        return [
            'sym_lib_table',
            [
                'lib',
                ['name', context.libraryName],
                ['type', 'KiCad'],
                ['uri', context.libraryTableRoot + '/' + libraryPath],
                ['options', ''],
                ['descr', '']
            ]
        ]
    }

    /**
     * Builds project-local 3D model entries.
     * @param {object[]} modelFiles Normalized model files.
     * @param {string} basePath Archive base path.
     * @param {string} [modelDirectory] Archive model directory.
     * @returns {{ path: string, bytes: Uint8Array, contentType: string }[]}
     */
    static modelEntries(modelFiles, basePath, modelDirectory = 'models') {
        return modelFiles.map((model) => ({
            path: Utils.joinPath(
                basePath,
                model.outputPath || Utils.joinPath(modelDirectory, model.name)
            ),
            bytes: model.bytes,
            contentType: CircuitJsonKicadProjectFiles.modelContentType(model)
        }))
    }

    /**
     * Builds the export manifest.
     * @param {{ path: string }[]} entries Archive entries.
     * @param {object} context Export context.
     * @returns {object}
     */
    static manifest(entries, context) {
        return {
            schema: 'kicad-toolkit.circuit-json-kicad-project-export.a1',
            projectName: context.projectName,
            libraryName: context.libraryName,
            files: entries.map((entry) => entry.path),
            modelDirectory: context.modelDirectory,
            modelDirectories:
                context.modelDirectories ||
                ModelRouting.modelDirectories(
                    context.modelFiles,
                    context.modelDirectory
                ),
            model3dSourcePaths: context.modelFiles
                .map((model) => model.sourcePath)
                .filter(Boolean)
        }
    }

    /**
     * Resolves a model file content type.
     * @param {{ name?: string, format?: string }} model Model file.
     * @returns {string}
     */
    static modelContentType(model) {
        const extension = (
            model.format || Utils.extension(model.name)
        ).toLowerCase()
        if (extension === 'step' || extension === 'stp') return 'model/step'
        if (extension === 'wrl' || extension === 'vrml') return 'model/vrml'
        return 'application/octet-stream'
    }
}
