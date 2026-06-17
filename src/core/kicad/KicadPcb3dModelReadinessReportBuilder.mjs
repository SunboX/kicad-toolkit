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
                candidateModelsByAssetKey: candidateModelKeysByAsset(models),
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
        footprintName: footprint.footprintName || '',
        pattern: footprint.footprintName || footprint.libraryName || '',
        x: footprint.x,
        y: footprint.y,
        rotation: footprint.rotation,
        pads: footprint.pads || [],
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
    const searchKeys = footprintSearchKeys(component)
    const pad1 = pad1Orientation(component)
    const fallbackPackage = fallback
        ? PcbScene3dPackages.resolve(
              fallbackPackageComponent(component),
              componentPadSpan(component)
          )
        : undefined
    const candidateModels = rankedCandidateModels(
        component,
        ref,
        assets,
        resolvedAsset
    )

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
        searchKeys: searchKeys.length ? searchKeys : undefined,
        candidateModels: candidateModels.length ? candidateModels : undefined,
        pad1Orientation: pad1 || undefined,
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
    if (!refTail && !refBase) return null
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
 * Ranks available model assets against one component and reference.
 * @param {object} component Component row.
 * @param {object} ref Model reference.
 * @param {object[]} assets Available assets.
 * @param {object | null} resolvedAsset Exact resolved asset, when present.
 * @returns {object[]}
 */
function rankedCandidateModels(component, ref, assets, resolvedAsset) {
    const candidates = []
    const componentKeys = componentCandidateKeys(component)

    for (const asset of assets || []) {
        const scored = scoreModelAsset({
            asset,
            componentKeys,
            resolvedAsset
        })
        if (!scored) continue
        candidates.push(scored)
    }

    return candidates
        .sort((left, right) => {
            return (
                right.score - left.score ||
                left.assetKey.localeCompare(right.assetKey)
            )
        })
        .slice(0, 5)
}

/**
 * Scores one model asset candidate.
 * @param {{
 *     asset: object,
 *     componentKeys: object[],
 *     resolvedAsset: object | null
 * }} options Score options.
 * @returns {object | null}
 */
function scoreModelAsset({ asset, componentKeys, resolvedAsset }) {
    const assetKey = assetIdentity(asset)
    const path = String(asset?.path || asset?.relativePath || asset?.name || '')
    const name = String(asset?.name || asset?.fileName || basename(path) || '')
    const format = String(asset?.format || extension(path || name) || '')
    const assetTerms = assetSearchTerms(asset)
    const exact = Boolean(resolvedAsset && asset === resolvedAsset)
    const matched = matchedComponentKeys(componentKeys, assetTerms)
    const score = exact ? 120 : candidateScore(matched)

    if (score <= 0) return null

    return stripUndefined({
        assetKey,
        name,
        path,
        format,
        score,
        matchKind: exact ? 'exact-name' : 'token-overlap',
        matchedKeys: matched.map((entry) => entry.key)
    })
}

/**
 * Builds weighted component keys for model candidate matching.
 * @param {object} component Component row.
 * @returns {{ key: string, weight: number, terms: string[] }[]}
 */
function componentCandidateKeys(component) {
    const rows = []
    for (const value of footprintNameValues(component)) {
        const suffix = footprintNameSuffix(value)
        const suffixTokens = splitFootprintTokens(suffix)
        for (const token of splitFootprintTokens(value)) {
            appendCandidateKey(rows, token, tokenWeight(token), [token])
        }
        for (const token of suffixTokens) {
            appendCandidateKey(rows, token, tokenWeight(token), [token])
        }
        appendCandidateKey(
            rows,
            suffix,
            suffixCompositeWeight(suffixTokens),
            suffixCompositeTerms(suffixTokens)
        )
    }
    return rows
}

/**
 * Adds one weighted candidate key when it has usable terms.
 * @param {object[]} rows Mutable key rows.
 * @param {unknown} key Candidate key.
 * @param {number} weight Match weight.
 * @param {string[]} terms Required asset terms.
 * @returns {void}
 */
function appendCandidateKey(rows, key, weight, terms) {
    const normalized = normalizeSearchKey(key)
    const normalizedTerms = terms.map(normalizeSearchKey).filter(Boolean)
    if (!normalized || weight <= 0 || normalizedTerms.length === 0) return
    if (rows.some((row) => row.key === normalized)) return
    rows.push({
        key: normalized,
        weight,
        terms: normalizedTerms
    })
}

/**
 * Returns component keys matched by an asset term set.
 * @param {{ key: string, weight: number, terms: string[] }[]} keys Component keys.
 * @param {Set<string>} assetTerms Normalized asset terms.
 * @returns {{ key: string, weight: number }[]}
 */
function matchedComponentKeys(keys, assetTerms) {
    const matches = keys
        .filter((row) => row.terms.every((term) => assetTerms.has(term)))
        .map((row) => ({ key: row.key, weight: row.weight }))
    return matches.filter(
        (match) => !hasMoreSpecificPackageMatch(match, matches)
    )
}

/**
 * Sums candidate key weights into a capped deterministic score.
 * @param {{ key: string, weight: number }[]} matches Matched keys.
 * @returns {number}
 */
function candidateScore(matches) {
    const score = matches.reduce((total, match) => total + match.weight, 0)
    return Math.min(score, 119)
}

/**
 * Builds normalized terms from one asset.
 * @param {object} asset Asset row.
 * @returns {Set<string>}
 */
function assetSearchTerms(asset) {
    const terms = new Set()
    for (const value of [
        asset?.key,
        asset?.name,
        asset?.fileName,
        asset?.path,
        asset?.relativePath
    ]) {
        for (const term of splitAssetTerms(value)) terms.add(term)
    }
    return terms
}

/**
 * Splits asset metadata into normalized matching terms.
 * @param {unknown} value Asset metadata value.
 * @returns {string[]}
 */
function splitAssetTerms(value) {
    const text = String(value || '')
    const stem = fileStem(text)
    const tokens = splitFootprintTokens(stem)
    const packagePrefixes = tokens
        .map((token) => token.split('-')[0])
        .filter((token) => /^[A-Z]{2,}$/u.test(token))
    return [
        ...new Set(
            [normalizeSearchKey(stem), ...tokens, ...packagePrefixes].filter(
                Boolean
            )
        )
    ]
}

/**
 * Returns the last path segment without its extension.
 * @param {unknown} value Candidate path.
 * @returns {string}
 */
function fileStem(value) {
    return basename(value).replace(/\.[^.]+$/u, '')
}

/**
 * Returns a sortable asset identity.
 * @param {object} asset Asset row.
 * @returns {string}
 */
function assetIdentity(asset) {
    return String(
        asset?.key ||
            asset?.id ||
            asset?.name ||
            asset?.fileName ||
            asset?.path ||
            asset?.relativePath ||
            ''
    )
}

/**
 * Returns the footprint item suffix after an optional library separator.
 * @param {unknown} value Footprint name value.
 * @returns {string}
 */
function footprintNameSuffix(value) {
    return String(value || '')
        .replace(/\\/gu, '/')
        .split('/')
        .pop()
        .split(':')
        .pop()
}

/**
 * Scores a composite footprint suffix key.
 * @param {string[]} tokens Normalized suffix tokens.
 * @returns {number}
 */
function suffixCompositeWeight(tokens) {
    if (tokens.length < 2) return 0
    return tokens.some((token) => /(^|-)1EP($|-)/u.test(token)) ? 50 : 34
}

/**
 * Lists required terms for a composite suffix match.
 * @param {string[]} tokens Normalized suffix tokens.
 * @returns {string[]}
 */
function suffixCompositeTerms(tokens) {
    return tokens.filter((token) => !/^P\d/u.test(token))
}

/**
 * Scores one normalized footprint token.
 * @param {string} token Normalized token.
 * @returns {number}
 */
function tokenWeight(token) {
    if (/^[A-Z]$/u.test(token)) return 0
    if (/^[A-Z]{2,}$/u.test(token)) return 20
    if (/^\d+[A-Z]*$/u.test(token)) return 20
    if (/^\d+X\d+(?:\.\d+)?MM$/u.test(token)) return 20
    if (/-\d+/u.test(token) || /(^|-)1EP($|-)/u.test(token)) return 28
    return 20
}

/**
 * Checks whether a generic package key is shadowed by a specific package key.
 * @param {{ key: string, weight: number }} match Candidate match.
 * @param {{ key: string, weight: number }[]} matches All candidate matches.
 * @returns {boolean}
 */
function hasMoreSpecificPackageMatch(match, matches) {
    if (!/^[A-Z]{2,}$/u.test(match.key)) return false
    return matches.some((candidate) => {
        return candidate.key.startsWith(match.key + '-')
    })
}

/**
 * Returns candidate model keys grouped by asset key.
 * @param {object[]} models Model rows.
 * @returns {Record<string, string[]>}
 */
function candidateModelKeysByAsset(models) {
    const rows = []
    for (const model of models) {
        for (const candidate of model.candidateModels || []) {
            rows.push({
                key: model.key,
                assetKey: candidate.assetKey
            })
        }
    }
    return keysBy(rows, 'assetKey')
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
                ...(model.searchKeys?.length
                    ? { suggestedSearchKeys: model.searchKeys }
                    : {}),
                ...(model.pad1Orientation
                    ? {
                          suggestedRotationZ:
                              model.pad1Orientation.suggestedRotationZ
                      }
                    : {}),
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
 * Builds deterministic model search keys from component footprint metadata.
 * @param {object} component Component row.
 * @returns {string[]}
 */
function footprintSearchKeys(component) {
    const keys = []
    for (const value of footprintNameValues(component)) {
        for (const token of splitFootprintTokens(value)) {
            appendSearchKey(keys, token)
            appendDerivedSearchKeys(keys, token)
        }
    }
    return keys
}

/**
 * Lists candidate footprint naming values.
 * @param {object} component Component row.
 * @returns {string[]}
 */
function footprintNameValues(component) {
    return [
        component?.pattern,
        component?.footprintName,
        component?.footprintId,
        component?.name
    ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
}

/**
 * Splits one footprint name into normalized token candidates.
 * @param {string} value Footprint name.
 * @returns {string[]}
 */
function splitFootprintTokens(value) {
    return String(value || '')
        .replace(/[:/\\]/gu, '_')
        .split(/[_()]+/u)
        .map(normalizeSearchKey)
        .filter(Boolean)
}

/**
 * Appends derived package keys from one normalized token.
 * @param {string[]} keys Mutable key list.
 * @param {string} token Normalized token.
 * @returns {void}
 */
function appendDerivedSearchKeys(keys, token) {
    const pinMatch = token.match(/-(\d+)(?:-|$)/u)
    if (pinMatch) appendSearchKey(keys, pinMatch[1])

    const exposedPadMatch = token.match(/(^|-)1EP($|-)/u)
    if (exposedPadMatch) {
        appendSearchKey(keys, '1EP')
        appendSearchKey(keys, 'EP')
    }

    const pitchMatch = token.match(/^P(\d+(?:\.\d+)?)(?:MM)?$/u)
    if (pitchMatch) {
        appendSearchKey(keys, pitchMatch[1].replace(/\./gu, '') + 'P')
    }
}

/**
 * Appends a normalized search key once.
 * @param {string[]} keys Mutable key list.
 * @param {unknown} value Candidate key.
 * @returns {void}
 */
function appendSearchKey(keys, value) {
    const key = normalizeSearchKey(value)
    if (key && !keys.includes(key)) keys.push(key)
}

/**
 * Normalizes one model search key.
 * @param {unknown} value Candidate key.
 * @returns {string}
 */
function normalizeSearchKey(value) {
    return String(value || '')
        .trim()
        .toUpperCase()
}

/**
 * Builds pad-1 orientation hints for model placement.
 * @param {object} component Component row.
 * @returns {{ padNumber: string, relativeX: number, relativeY: number, suggestedRotationZ: number } | null}
 */
function pad1Orientation(component) {
    const pad = (component?.pads || []).find(isPad1Candidate)
    if (!pad) return null

    const relative = padRelativePoint(pad, component)
    if (!relative) return null

    return {
        padNumber: String(pad.number || pad.name || ''),
        relativeX: roundMetric(relative.x),
        relativeY: roundMetric(relative.y),
        suggestedRotationZ: suggestedRotationForPad1(relative.x, relative.y)
    }
}

/**
 * Returns true when a pad is a suitable orientation marker.
 * @param {object} pad Pad row.
 * @returns {boolean}
 */
function isPad1Candidate(pad) {
    return ['1', 'A1', 'K'].includes(String(pad?.number || pad?.name || ''))
}

/**
 * Resolves pad coordinates relative to the component origin.
 * @param {object} pad Pad row.
 * @param {object} component Component row.
 * @returns {{ x: number, y: number } | null}
 */
function padRelativePoint(pad, component) {
    const directX = finiteNumber(pad.relativeX ?? pad.localX)
    const directY = finiteNumber(pad.relativeY ?? pad.localY)
    if (directX !== null && directY !== null) {
        return { x: directX, y: directY }
    }

    const padX = finiteNumber(pad.x)
    const padY = finiteNumber(pad.y)
    const originX = finiteNumber(component?.x)
    const originY = finiteNumber(component?.y)
    if (
        padX === null ||
        padY === null ||
        originX === null ||
        originY === null
    ) {
        return null
    }

    return {
        x: padX - originX,
        y: padY - originY
    }
}

/**
 * Suggests model Z rotation from the pad-1 quadrant.
 * @param {number} x Relative X.
 * @param {number} y Relative Y.
 * @returns {number}
 */
function suggestedRotationForPad1(x, y) {
    if (x < 0) return y > 0 ? -90 : 0
    if (x > 0) return y < 0 ? 90 : 180
    return y > 0 ? 180 : 0
}

/**
 * Returns a finite number or null.
 * @param {unknown} value Candidate value.
 * @returns {number | null}
 */
function finiteNumber(value) {
    const number = Number(value)
    return Number.isFinite(number) ? number : null
}

/**
 * Rounds a metric value to stable precision.
 * @param {unknown} value Candidate number.
 * @returns {number}
 */
function roundMetric(value) {
    const number = Number(value)
    if (!Number.isFinite(number)) return 0
    return Math.round(number * 1000) / 1000
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
