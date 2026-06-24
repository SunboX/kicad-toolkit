// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

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
                classes: [
                    {
                        name: 'Default',
                        track_width: minTrackWidth,
                        via_diameter: minViaDiameter,
                        via_drill: minViaDrill,
                        clearance: Utils.number(
                            board.min_trace_to_pad_edge_clearance,
                            0.1
                        )
                    }
                ]
            },
            sheets: [[Utils.uuid('sheet:root'), 'Root']]
        }
    }

    /**
     * Builds the footprint library table node.
     * @param {object} context Export context.
     * @returns {Array}
     */
    static fpLibTableNode(context) {
        return [
            'fp_lib_table',
            [
                'lib',
                ['name', context.libraryName],
                ['type', 'KiCad'],
                ['uri', '${KIPRJMOD}/' + context.libraryName + '.pretty'],
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
        return [
            'sym_lib_table',
            [
                'lib',
                ['name', context.libraryName],
                ['type', 'KiCad'],
                ['uri', '${KIPRJMOD}/' + context.libraryName + '.kicad_sym'],
                ['options', ''],
                ['descr', '']
            ]
        ]
    }

    /**
     * Builds project-local 3D model entries.
     * @param {object[]} modelFiles Normalized model files.
     * @param {string} basePath Archive base path.
     * @returns {{ path: string, bytes: Uint8Array, contentType: string }[]}
     */
    static modelEntries(modelFiles, basePath) {
        return modelFiles.map((model) => ({
            path: Utils.joinPath(basePath, 'models/' + model.name),
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
