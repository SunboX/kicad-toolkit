// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonModelAdapterPrimitives } from './CircuitJsonModelAdapterPrimitives.mjs'

const Primitives = CircuitJsonModelAdapterPrimitives
const MODEL_FORMATS = Object.freeze({
    '3mf': { field: 'model_3mf_url', mimetype: 'model/3mf' },
    glb: { field: 'model_glb_url', mimetype: 'model/gltf-binary' },
    gltf: { field: 'model_gltf_url', mimetype: 'model/gltf+json' },
    obj: { field: 'model_obj_url', mimetype: 'model/obj' },
    step: { field: 'model_step_url', mimetype: 'model/step' },
    stl: { field: 'model_stl_url', mimetype: 'model/stl' },
    stp: { field: 'model_step_url', mimetype: 'model/step' },
    vrml: { field: 'model_wrl_url', mimetype: 'model/vrml' },
    wrl: { field: 'model_wrl_url', mimetype: 'model/vrml' }
})

/**
 * Projects native KiCad footprint model placements into canonical CAD rows.
 */
export class CircuitJsonPcbCadComponentBuilder {
    /**
     * Appends every visible model for one PCB component.
     * @param {object[]} circuitJson CircuitJSON target.
     * @param {{ component: object, componentIndex: number, idScope: string, pcbComponentId: string, sourceComponentId: string, sourceFileName?: string, modelAssetNames?: string[], projectRoot?: string | null, rendererModel?: object }} context Projection context.
     * @returns {object[]} Model-reference diagnostics.
     */
    static append(circuitJson, context) {
        const diagnostics = []
        const models = CircuitJsonPcbCadComponentBuilder.#models(
            context.component
        )
        for (const [modelIndex, model] of models.entries()) {
            if (model.visible === false) {
                diagnostics.push(
                    CircuitJsonPcbCadComponentBuilder.#hiddenDiagnostic(
                        model,
                        context
                    )
                )
                continue
            }
            const reference = CircuitJsonPcbCadComponentBuilder.#modelReference(
                model.path,
                context.sourceFileName,
                context.modelAssetNames,
                context.projectRoot
            )
            if (!reference.path) continue
            if (reference.diagnostic) {
                diagnostics.push({
                    ...reference.diagnostic,
                    details: {
                        ...reference.diagnostic.details,
                        component: String(
                            context.component.designator ||
                                context.component.name ||
                                ''
                        ),
                        modelReference: String(model.path || '')
                    }
                })
            }

            const format = CircuitJsonPcbCadComponentBuilder.#format(
                reference.path
            )
            const center = Primitives.milPoint(
                context.component.x,
                context.component.y
            )
            const layer = Primitives.side(context.component.layer)
            const boardThickness = Primitives.boardThickness(
                context.rendererModel
            )
            const modelField = format.field
                ? { [format.field]: reference.path }
                : {}
            circuitJson.push({
                type: 'cad_component',
                cad_component_id: Primitives.id(context.idScope, [
                    'cad_component',
                    context.component.designator || context.componentIndex,
                    modelIndex,
                    model.path
                ]),
                pcb_component_id: context.pcbComponentId,
                source_component_id: context.sourceComponentId,
                layer,
                position: {
                    x: center.x,
                    y: center.y,
                    z: Primitives.round(
                        ((layer === 'bottom' ? -1 : 1) * boardThickness) / 2
                    )
                },
                rotation: {
                    x: 0,
                    y: 0,
                    z: Primitives.number(context.component.rotation, 0)
                },
                ...modelField,
                model_asset: {
                    project_relative_path: reference.path,
                    url: reference.path,
                    mimetype: format.mimetype
                },
                model_offset: CircuitJsonPcbCadComponentBuilder.#vector(
                    model.offset,
                    0
                ),
                model_rotation: CircuitJsonPcbCadComponentBuilder.#vector(
                    model.rotation,
                    0
                ),
                model_scale: CircuitJsonPcbCadComponentBuilder.#vector(
                    model.scale,
                    1
                ),
                model_unit_to_mm_scale_factor: 1
            })
        }
        if (diagnostics.length && context.rendererModel) {
            context.rendererModel.diagnostics = [
                ...(Array.isArray(context.rendererModel.diagnostics)
                    ? context.rendererModel.diagnostics
                    : []),
                ...diagnostics
            ]
        }
        return diagnostics
    }

    /**
     * Returns all retained model placements, including a legacy primary model.
     * @param {object} component Renderer component.
     * @returns {object[]} Model placements.
     */
    static #models(component) {
        if (Array.isArray(component.models)) return component.models
        const path = String(component.modelPath || '').trim()
        if (!path) return []
        const transform = component.modelTransform || {}
        const offsetMil = transform.offsetMil || {}
        return [
            {
                path,
                visible: true,
                offset: {
                    x: Primitives.milNumber(offsetMil.x, 0),
                    y: Primitives.milNumber(offsetMil.y, 0),
                    z: Primitives.milNumber(offsetMil.z, 0)
                },
                rotation: transform.rotationDeg,
                scale: transform.scale
            }
        ]
    }

    /**
     * Resolves a source reference against its board directory and exact assets.
     * @param {unknown} value Raw model path.
     * @param {unknown} sourceFileName Board path.
     * @param {unknown} modelAssetNames Available canonical asset paths.
     * @param {unknown} projectRoot Canonical project root or null.
     * @returns {{ path: string, diagnostic: object | null }} Resolution.
     */
    static #modelReference(
        value,
        sourceFileName,
        modelAssetNames,
        projectRoot
    ) {
        const raw = String(value || '')
            .trim()
            .replaceAll('\\', '/')
        if (!raw) return { path: '', diagnostic: null }
        const assetNames = new Set(
            (Array.isArray(modelAssetNames) ? modelAssetNames : [])
                .map((name) =>
                    String(name || '')
                        .trim()
                        .replaceAll('\\', '/')
                )
                .filter(Boolean)
        )
        const variable = raw.match(/^\$\{([^}]+)\}(?:\/(.*))?$/u)
        if (variable && variable[1] !== 'KIPRJMOD') {
            return {
                path: raw,
                diagnostic:
                    CircuitJsonPcbCadComponentBuilder.#unresolvedDiagnostic(
                        'kicad.pcb.3d-model.unresolved-variable',
                        `KiCad 3D model variable \${${variable[1]}} has no project mapping.`,
                        sourceFileName
                    )
            }
        }
        if (/\$\{[^}]+\}/u.test(raw) && !variable) {
            return {
                path: raw,
                diagnostic:
                    CircuitJsonPcbCadComponentBuilder.#unresolvedDiagnostic(
                        'kicad.pcb.3d-model.unresolved-variable',
                        'KiCad 3D model reference contains an unresolved variable.',
                        sourceFileName
                    )
            }
        }
        if (CircuitJsonPcbCadComponentBuilder.#isExternalUrl(raw)) {
            return { path: raw, diagnostic: null }
        }
        if (!variable && assetNames.has(raw)) {
            return { path: raw, diagnostic: null }
        }

        const relative = variable ? variable[2] || '' : raw
        const boardDirectory = String(sourceFileName || '')
            .replaceAll('\\', '/')
            .split('/')
            .slice(0, -1)
            .join('/')
        const baseName =
            variable && projectRoot !== null && projectRoot !== undefined
                ? String(projectRoot).replaceAll('\\', '/')
                : boardDirectory
        const joined = CircuitJsonPcbCadComponentBuilder.#normalizedPath(
            [baseName, relative].filter(Boolean).join('/')
        )
        if (!joined) {
            return {
                path: raw,
                diagnostic:
                    CircuitJsonPcbCadComponentBuilder.#unresolvedDiagnostic(
                        'kicad.pcb.3d-model.unsafe-reference',
                        'KiCad 3D model path escapes the project root.',
                        sourceFileName
                    )
            }
        }
        const diagnostic =
            assetNames.size > 0 && !assetNames.has(joined)
                ? CircuitJsonPcbCadComponentBuilder.#unresolvedDiagnostic(
                      'kicad.pcb.3d-model.unresolved-reference',
                      'KiCad 3D model does not match an exact project asset path.',
                      sourceFileName,
                      { resolvedPath: joined }
                  )
                : null
        return { path: joined, diagnostic }
    }

    /**
     * Normalizes a project-relative path while rejecting root escapes.
     * @param {string} value Candidate path.
     * @returns {string} Safe path or an empty string.
     */
    static #normalizedPath(value) {
        const parts = []
        for (const part of value.split('/')) {
            if (!part || part === '.') continue
            if (part === '..') {
                if (!parts.length) return ''
                parts.pop()
                continue
            }
            parts.push(part)
        }
        return parts.join('/')
    }

    /**
     * Returns model field and media metadata for a reference.
     * @param {string} path Model path.
     * @returns {{ field?: string, mimetype: string }} Model format.
     */
    static #format(path) {
        const cleanPath = path.split(/[?#]/u)[0]
        const extension = String(cleanPath.split('.').pop() || '').toLowerCase()
        return (
            MODEL_FORMATS[extension] || {
                mimetype: 'application/octet-stream'
            }
        )
    }

    /**
     * Normalizes a three-axis vector.
     * @param {object | undefined} value Source vector.
     * @param {number} fallback Fallback coordinate.
     * @returns {{ x: number, y: number, z: number }} Vector.
     */
    static #vector(value, fallback) {
        return {
            x: Primitives.round(Primitives.number(value?.x, fallback)),
            y: Primitives.round(Primitives.number(value?.y, fallback)),
            z: Primitives.round(Primitives.number(value?.z, fallback))
        }
    }

    /**
     * Returns whether a model reference is already an external URL.
     * @param {string} value Model reference.
     * @returns {boolean} URL status.
     */
    static #isExternalUrl(value) {
        return /^(?:data:|https?:\/\/)/iu.test(value)
    }

    /**
     * Builds a diagnostic for a skipped hidden model.
     * @param {object} model Native model.
     * @param {object} context Projection context.
     * @returns {object} Diagnostic.
     */
    static #hiddenDiagnostic(model, context) {
        return {
            severity: 'info',
            code: 'kicad.pcb.3d-model.hidden',
            message: 'Skipped a hidden KiCad footprint 3D model.',
            source: String(context.sourceFileName || ''),
            details: {
                component: String(
                    context.component.designator || context.component.name || ''
                ),
                modelReference: String(model.path || '')
            }
        }
    }

    /**
     * Builds one unresolved-reference diagnostic.
     * @param {string} code Diagnostic code.
     * @param {string} message Diagnostic message.
     * @param {unknown} sourceFileName Source board path.
     * @param {object} [details] Extra details.
     * @returns {object} Diagnostic.
     */
    static #unresolvedDiagnostic(code, message, sourceFileName, details = {}) {
        return {
            severity: 'warning',
            code,
            message,
            source: String(sourceFileName || ''),
            details
        }
    }
}

Object.freeze(CircuitJsonPcbCadComponentBuilder.prototype)
Object.freeze(CircuitJsonPcbCadComponentBuilder)
