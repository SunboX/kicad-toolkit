// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'
import { CircuitJsonKicadProjectMetadata as Metadata } from './CircuitJsonKicadProjectMetadata.mjs'

/**
 * Builds KiCad footprint 3D model nodes from CircuitJSON CAD components.
 */
export class CircuitJsonKicadProjectPcbModelBuilder {
    /**
     * Builds model nodes for one footprint row.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {Array[]}
     */
    static modelNodes(context, row) {
        const cadComponents =
            CircuitJsonKicadProjectPcbModelBuilder.#cadComponents(context, row)
        const metadataModels =
            CircuitJsonKicadProjectPcbModelBuilder.#metadataModelNodes(
                context,
                row
            )

        if (cadComponents.length) {
            return [
                ...metadataModels,
                ...cadComponents
                    .map((cadComponent) =>
                        CircuitJsonKicadProjectPcbModelBuilder.#cadModelNode(
                            context,
                            row,
                            cadComponent
                        )
                    )
                    .filter(Boolean)
            ]
        }

        if (CircuitJsonKicadProjectPcbModelBuilder.#hasCadComponents(context)) {
            return metadataModels
        }

        return [
            ...metadataModels,
            ...CircuitJsonKicadProjectPcbModelBuilder.#fallbackModelNodes(
                context
            )
        ]
    }

    /**
     * Builds model nodes from footprint metadata.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {Array[]}
     */
    static #metadataModelNodes(context, row) {
        return Metadata.footprintModels(row)
            .map((model) =>
                CircuitJsonKicadProjectPcbModelBuilder.#metadataModelNode(
                    context,
                    model
                )
            )
            .filter(Boolean)
    }

    /**
     * Builds one model node from footprint metadata.
     * @param {object} context Export context.
     * @param {object} model Model metadata row.
     * @returns {Array | null}
     */
    static #metadataModelNode(context, model) {
        const sourcePath = Utils.text(
            model.sourcePath || model.path || model.name
        )
        if (!sourcePath) return null
        const modelFile =
            CircuitJsonKicadProjectPcbModelBuilder.#modelFileForSource(
                context.modelFiles,
                sourcePath
            )
        const path = modelFile
            ? CircuitJsonKicadProjectPcbModelBuilder.modelPath(
                  context.modelPathPrefix,
                  modelFile.name
              )
            : sourcePath

        return CircuitJsonKicadProjectPcbModelBuilder.#modelNode({
            path,
            offset: CircuitJsonKicadProjectPcbModelBuilder.#point3(
                model.offset
            ),
            scale: CircuitJsonKicadProjectPcbModelBuilder.#scaleObject(
                model.scale
            ),
            rotate: CircuitJsonKicadProjectPcbModelBuilder.#rotationObject(
                model.rotate || model.rotation
            )
        })
    }

    /**
     * Builds legacy model nodes from caller-supplied project model files.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static #fallbackModelNodes(context) {
        return (context.modelFiles || []).map((model) =>
            CircuitJsonKicadProjectPcbModelBuilder.#modelNode({
                path: CircuitJsonKicadProjectPcbModelBuilder.modelPath(
                    context.modelPathPrefix,
                    model.name
                )
            })
        )
    }

    /**
     * Builds one model node from a CAD component row.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @param {object} cadComponent CAD component row.
     * @returns {Array | null}
     */
    static #cadModelNode(context, row, cadComponent) {
        const sourcePath =
            CircuitJsonKicadProjectPcbModelBuilder.#modelSourcePath(
                cadComponent
            )
        if (!sourcePath) return null
        const modelFile =
            CircuitJsonKicadProjectPcbModelBuilder.#modelFileForSource(
                context.modelFiles,
                sourcePath
            )
        const modelPath = modelFile
            ? CircuitJsonKicadProjectPcbModelBuilder.modelPath(
                  context.modelPathPrefix,
                  modelFile.name
              )
            : sourcePath

        return CircuitJsonKicadProjectPcbModelBuilder.#modelNode({
            path: modelPath,
            offset: CircuitJsonKicadProjectPcbModelBuilder.#modelOffset(
                context,
                row.pcbComponent || {},
                cadComponent
            ),
            rotate: CircuitJsonKicadProjectPcbModelBuilder.#modelRotation(
                row.pcbComponent || {},
                cadComponent
            ),
            scale: CircuitJsonKicadProjectPcbModelBuilder.#modelScale(
                cadComponent
            )
        })
    }

    /**
     * Builds one KiCad model node.
     * @param {{ path: string, offset?: object, rotate?: object, scale?: object }} model Model row.
     * @returns {Array}
     */
    static #modelNode(model) {
        return [
            'model',
            model.path,
            [
                'offset',
                [
                    'xyz',
                    Utils.round(model.offset?.x || 0),
                    Utils.round(model.offset?.y || 0),
                    Utils.round(model.offset?.z || 0)
                ]
            ],
            [
                'scale',
                [
                    'xyz',
                    Utils.round(model.scale?.x || 1),
                    Utils.round(model.scale?.y || 1),
                    Utils.round(model.scale?.z || 1)
                ]
            ],
            [
                'rotate',
                [
                    'xyz',
                    Utils.round(model.rotate?.x || 0),
                    Utils.round(model.rotate?.y || 0),
                    Utils.round(model.rotate?.z || 0)
                ]
            ]
        ]
    }

    /**
     * Builds a model path for footprint references.
     * @param {string} prefix Model path prefix.
     * @param {string} name Model file name.
     * @returns {string}
     */
    static modelPath(prefix, name) {
        const normalizedPrefix = String(prefix || '')
        return (
            normalizedPrefix +
            (normalizedPrefix.endsWith('/') ? '' : '/') +
            name
        )
    }

    /**
     * Resolves CAD component rows for one footprint.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {object[]}
     */
    static #cadComponents(context, row) {
        const componentId = Utils.text(row?.pcbComponent?.pcb_component_id)
        if (!componentId) return []
        return context.cadComponents?.byPcbComponentId?.get(componentId) || []
    }

    /**
     * Returns true when any CAD component rows are present.
     * @param {object} context Export context.
     * @returns {boolean}
     */
    static #hasCadComponents(context) {
        return (
            context.cadComponents?.byPcbComponentId instanceof Map &&
            context.cadComponents.byPcbComponentId.size > 0
        )
    }

    /**
     * Resolves the preferred model source path for a CAD component.
     * @param {object} cadComponent CAD component row.
     * @returns {string}
     */
    static #modelSourcePath(cadComponent) {
        return Utils.text(
            cadComponent?.model_step_url ||
                cadComponent?.model_wrl_url ||
                cadComponent?.model_obj_url ||
                cadComponent?.model_glb_url ||
                cadComponent?.model_gltf_url ||
                cadComponent?.model_url ||
                cadComponent?.model_path ||
                cadComponent?.path ||
                ''
        )
    }

    /**
     * Resolves the model file matching a source path.
     * @param {object[]} modelFiles Normalized model files.
     * @param {string} sourcePath Source path.
     * @returns {object | null}
     */
    static #modelFileForSource(modelFiles, sourcePath) {
        const sourceKey =
            CircuitJsonKicadProjectPcbModelBuilder.#sourceKey(sourcePath)
        const sourceName = Utils.baseName(sourcePath).toLowerCase()
        return (
            (modelFiles || []).find((model) => {
                const modelKey =
                    CircuitJsonKicadProjectPcbModelBuilder.#sourceKey(
                        model.sourcePath
                    )
                const modelName = Utils.baseName(model.name).toLowerCase()
                return (
                    modelKey === sourceKey ||
                    (!!sourceName && modelName === sourceName)
                )
            }) || null
        )
    }

    /**
     * Resolves a normalized source path key.
     * @param {unknown} sourcePath Candidate source path.
     * @returns {string}
     */
    static #sourceKey(sourcePath) {
        return Utils.text(sourcePath).split('?')[0].split('#')[0].toLowerCase()
    }

    /**
     * Resolves model offset relative to the footprint origin.
     * @param {object} context Export context.
     * @param {object} component PCB component row.
     * @param {object} cadComponent CAD component row.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #modelOffset(context, component, cadComponent) {
        const center = Utils.point(component) || { x: 0, y: 0 }
        const position = CircuitJsonKicadProjectPcbModelBuilder.#point3(
            cadComponent?.position
        ) || { x: center.x, y: center.y, z: 0 }
        const origin = CircuitJsonKicadProjectPcbModelBuilder.#point3(
            cadComponent?.model_origin_position ||
                cadComponent?.modelOriginPosition
        ) || { x: 0, y: 0, z: 0 }

        return {
            x: Utils.round(position.x - center.x - origin.x),
            y: Utils.round(position.y - center.y - origin.y),
            z: Utils.round(
                position.z -
                    CircuitJsonKicadProjectPcbModelBuilder.#boardSurfaceZ(
                        context,
                        component
                    ) -
                    origin.z
            )
        }
    }

    /**
     * Resolves the board surface Z for a component side.
     * @param {object} context Export context.
     * @param {object} component PCB component row.
     * @returns {number}
     */
    static #boardSurfaceZ(context, component) {
        const thickness = Utils.number(
            context.board?.thickness ??
                context.board?.pcb_thickness ??
                context.board?.board_thickness,
            0
        )
        if (!thickness) return 0
        return CircuitJsonKicadProjectPcbModelBuilder.#side(
            component.layer || component.side
        ) === 'bottom'
            ? -thickness / 2
            : thickness / 2
    }

    /**
     * Normalizes a top/bottom side value.
     * @param {unknown} value Candidate side.
     * @returns {'top' | 'bottom'}
     */
    static #side(value) {
        const text = Utils.text(value).toLowerCase()
        return text === 'bottom' ||
            text === 'back' ||
            text === 'b' ||
            text === 'b.cu'
            ? 'bottom'
            : 'top'
    }

    /**
     * Resolves model rotation relative to the footprint rotation.
     * @param {object} component PCB component row.
     * @param {object} cadComponent CAD component row.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #modelRotation(component, cadComponent) {
        const rotation = CircuitJsonKicadProjectPcbModelBuilder.#rotationObject(
            cadComponent?.rotation || cadComponent?.model_rotation
        )
        const footprintRotation = Utils.number(component?.rotation, 0)

        return {
            x: rotation.x,
            y: rotation.y,
            z: Utils.round(rotation.z - footprintRotation)
        }
    }

    /**
     * Resolves model scale.
     * @param {object} cadComponent CAD component row.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #modelScale(cadComponent) {
        const objectScale = CircuitJsonKicadProjectPcbModelBuilder.#scaleObject(
            cadComponent?.scale
        )
        if (objectScale) return objectScale

        const scale = Utils.number(
            cadComponent?.model_unit_to_mm_scale_factor ??
                cadComponent?.model_scale ??
                cadComponent?.scale,
            1
        )
        return { x: scale, y: scale, z: scale }
    }

    /**
     * Resolves one scale object.
     * @param {unknown} value Candidate scale.
     * @returns {{ x: number, y: number, z: number } | null}
     */
    static #scaleObject(value) {
        if (!value || typeof value !== 'object') return null
        return {
            x: Utils.number(value.x, 1),
            y: Utils.number(value.y, 1),
            z: Utils.number(value.z, 1)
        }
    }

    /**
     * Resolves one 3D point object.
     * @param {unknown} value Candidate point.
     * @returns {{ x: number, y: number, z: number } | null}
     */
    static #point3(value) {
        if (!value || typeof value !== 'object') return null
        const x = Utils.number(value.x, NaN)
        const y = Utils.number(value.y, NaN)
        const z = Utils.number(value.z, 0)
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null
        return { x, y, z }
    }

    /**
     * Resolves one rotation object.
     * @param {unknown} value Candidate rotation.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #rotationObject(value) {
        if (value && typeof value === 'object') {
            return {
                x: Utils.number(value.x, 0),
                y: Utils.number(value.y, 0),
                z: Utils.number(value.z, 0)
            }
        }

        return { x: 0, y: 0, z: Utils.number(value, 0) }
    }
}
