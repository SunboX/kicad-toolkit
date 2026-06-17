// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { PcbScene3dPackages } from '../../PcbScene3dPackages.mjs'

const schemaId = 'kicad-toolkit.pcb.3d-model-readiness.a1'

/**
 * Builds 3D model reference readiness reports for KiCad PCB models.
 */
export class KicadPcb3dModelReadinessReportBuilder {
    /**
     * Builds a deterministic 3D model readiness report.
     * @param {object} pcb KiCad PCB model or normalized PCB sidecar.
     * @param {{ assets?: object[], sessionAssets?: object[] }} [options] Asset options.
     * @returns {object}
     */
    static build(pcb = {}, options = {}) {
        const assets = [
            ...(options.assets || []),
            ...(options.sessionAssets || [])
        ]
        const components = componentRows(pcb)
        const models = modelRows(components, assets)
        const diagnostics = diagnosticsFor(components, models)

        return {
            schema: schemaId,
            summary: summary(components, models, diagnostics),
            models,
            diagnostics,
            indexes: {
                modelsByFormat: keysBy(models, 'format'),
                unresolvedModels: models
                    .filter((model) => model.resolved === false)
                    .map((model) => model.key),
                diagnosticsByCode: keysBy(diagnostics, 'code')
            }
        }
    }
}

/**
 * Lists component rows from normalized or raw PCB models.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function componentRows(pcb) {
    if ((pcb.components || []).length) return pcb.components || []
    return (sourceBoard(pcb).footprints || []).map((footprint, index) => ({
        componentIndex: index,
        designator: footprint.reference || '',
        footprintId: footprint.id || '',
        models: footprint.models || []
    }))
}

/**
 * Builds model rows.
 * @param {object[]} components Component rows.
 * @param {object[]} assets Available model assets.
 * @returns {object[]}
 */
function modelRows(components, assets) {
    const rows = []
    for (const component of components) {
        const refs = componentModelReferences(component)
        if (refs.length === 0) {
            rows.push(
                modelRow(component, { format: 'package' }, assets, rows.length)
            )
            continue
        }
        for (const ref of refs) {
            rows.push(modelRow(component, ref, assets, rows.length))
        }
    }
    return rows
}

/**
 * Lists model references for one component.
 * @param {object} component Component row.
 * @returns {object[]}
 */
function componentModelReferences(component) {
    const refs = [...(component.models || [])]
    if (component.modelPath || component.modelName) {
        refs.push({
            name: component.modelName,
            path: component.modelPath,
            transform: component.modelTransform
        })
    }
    return refs
}

/**
 * Builds one model readiness row.
 * @param {object} component Component row.
 * @param {object} ref Model reference.
 * @param {object[]} assets Available assets.
 * @param {number} index Row index.
 * @returns {object}
 */
function modelRow(component, ref, assets, index) {
    const path = String(ref.path || ref.sourcePath || '')
    const name = String(ref.name || basename(path) || '')
    const format = String(ref.format || extension(path || name) || 'package')
    const resolvedAsset = resolveAsset(path || name, assets)
    const fallback = format === 'package'
    const fallbackPackage = fallback
        ? PcbScene3dPackages.resolve(
              fallbackPackageComponent(component),
              componentPadSpan(component)
          )
        : undefined

    return stripUndefined({
        key: 'model-' + index,
        componentIndex: Number(component.componentIndex ?? index),
        designator: String(component.designator || ''),
        footprintId: String(component.footprintId || ''),
        name,
        path,
        format,
        fallback,
        resolved: fallback ? false : Boolean(resolvedAsset),
        resolvedAssetKey: resolvedAsset?.key || resolvedAsset?.name,
        fallbackPackage,
        transform: ref.transform || component.modelTransform
    })
}

/**
 * Resolves one model reference against available assets.
 * @param {string} reference Model reference.
 * @param {object[]} assets Available assets.
 * @returns {object | null}
 */
function resolveAsset(reference, assets) {
    const refTail = normalizePathTail(reference)
    const refBase = basename(reference)
    return (
        (assets || []).find((asset) => {
            const candidates = [
                asset.path,
                asset.relativePath,
                asset.name,
                asset.fileName
            ].map(normalizePathTail)
            return candidates.includes(refTail) || candidates.includes(refBase)
        }) || null
    )
}

/**
 * Builds diagnostics for readiness rows.
 * @param {object[]} components Component rows.
 * @param {object[]} models Model rows.
 * @returns {object[]}
 */
function diagnosticsFor(components, models) {
    const diagnostics = []
    for (const model of models) {
        if (!model.fallback && model.resolved === false) {
            diagnostics.push({
                key: 'model-readiness-' + diagnostics.length,
                code: 'kicad.pcb.3d-model.unresolved-reference',
                severity: 'warning',
                modelKey: model.key,
                componentIndex: model.componentIndex,
                message:
                    'KiCad PCB component references a 3D model that was not found in available assets.'
            })
        }
        if (model.fallback) {
            diagnostics.push({
                key: 'model-readiness-' + diagnostics.length,
                code: 'kicad.pcb.3d-model.procedural-fallback',
                severity: 'info',
                modelKey: model.key,
                componentIndex: model.componentIndex,
                fallbackFamily: model.fallbackPackage?.family,
                fallbackSizeMil: model.fallbackPackage?.sizeMil,
                message:
                    'KiCad PCB component has no explicit model reference and may need procedural fallback geometry.'
            })
        }
    }
    for (const component of components) {
        if (componentModelReferences(component).length === 0) {
            diagnostics.push({
                key: 'model-readiness-' + diagnostics.length,
                code: 'kicad.pcb.3d-model.component-without-model',
                severity: 'info',
                componentIndex: Number(component.componentIndex ?? 0),
                message:
                    'KiCad PCB component does not include an explicit 3D model reference.'
            })
        }
    }
    return diagnostics
}

/**
 * Builds summary counts.
 * @param {object[]} components Component rows.
 * @param {object[]} models Model rows.
 * @param {object[]} diagnostics Diagnostic rows.
 * @returns {object}
 */
function summary(components, models, diagnostics) {
    return {
        componentCount: components.length,
        componentWithModelCount: components.filter((component) => {
            return componentModelReferences(component).length > 0
        }).length,
        modelReferenceCount: models.length,
        resolvedModelCount: models.filter((model) => model.resolved === true)
            .length,
        unresolvedModelCount: models.filter((model) => model.resolved === false)
            .length,
        fallbackComponentCount: models.filter((model) => model.fallback).length,
        formatCount: new Set(models.map((model) => model.format)).size,
        diagnosticCount: diagnostics.length
    }
}

/**
 * Resolves the raw board object from normalized wrappers.
 * @param {object} pcb Candidate PCB object.
 * @returns {object}
 */
function sourceBoard(pcb) {
    return pcb?.kicadBoard || pcb?.pcb?.kicadBoard || pcb?.pcb || {}
}

/**
 * Returns a path basename.
 * @param {unknown} path Candidate path.
 * @returns {string}
 */
function basename(path) {
    return (
        String(path || '')
            .split(/[\\/]/u)
            .pop() || ''
    )
}

/**
 * Returns a lowercase extension.
 * @param {unknown} path Candidate path.
 * @returns {string}
 */
function extension(path) {
    const match = String(path || '').match(/\.([A-Za-z0-9]+)$/u)
    return match ? match[1].toLowerCase() : ''
}

/**
 * Normalizes a model path tail.
 * @param {unknown} value Candidate path.
 * @returns {string}
 */
function normalizePathTail(value) {
    return String(value || '')
        .replace('${KIPRJMOD}/', '')
        .replace(/\\/gu, '/')
        .toLowerCase()
}

/**
 * Builds a component shape for package-family resolution.
 * @param {object} component Component row.
 * @returns {object}
 */
function fallbackPackageComponent(component) {
    return {
        ...component,
        pattern:
            component?.pattern ||
            component?.footprintId ||
            component?.footprintName ||
            component?.name
    }
}

/**
 * Resolves package pad span fallback dimensions from a component row.
 * @param {object} component Component row.
 * @returns {{ width: number, depth: number }}
 */
function componentPadSpan(component) {
    return {
        width: firstPositiveNumber(
            component?.width,
            component?.bodyWidth,
            component?.packageWidth,
            component?.padSpan?.width,
            component?.padSpanWidth
        ),
        depth: firstPositiveNumber(
            component?.depth,
            component?.bodyDepth,
            component?.packageDepth,
            component?.padSpan?.depth,
            component?.padSpanDepth
        )
    }
}

/**
 * Resolves the first positive numeric candidate.
 * @param {...unknown} values Candidate values.
 * @returns {number}
 */
function firstPositiveNumber(...values) {
    for (const value of values) {
        const number = Number(value)
        if (Number.isFinite(number) && number > 0) return number
    }
    return 0
}

/**
 * Groups row keys by one field.
 * @param {object[]} rows Rows.
 * @param {string} field Field name.
 * @returns {Record<string, string[]>}
 */
function keysBy(rows, field) {
    const groups = {}
    for (const row of rows) {
        const key = String(row[field] || '')
        if (!key) continue
        groups[key] ||= []
        groups[key].push(row.key)
    }
    return Object.fromEntries(Object.entries(groups).sort())
}

/**
 * Removes undefined fields.
 * @param {Record<string, unknown>} value Candidate object.
 * @returns {Record<string, unknown>}
 */
function stripUndefined(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(([, entryValue]) => {
            return entryValue !== undefined
        })
    )
}
