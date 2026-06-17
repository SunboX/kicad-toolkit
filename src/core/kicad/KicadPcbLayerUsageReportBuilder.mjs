// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadLayerResolver } from './KicadLayerResolver.mjs'

const schemaId = 'kicad-toolkit.pcb.layer-usage.a1'

/**
 * Builds declared-versus-used PCB layer usage reports.
 */
export class KicadPcbLayerUsageReportBuilder {
    /**
     * Builds a deterministic layer usage report.
     * @param {object} pcb KiCad PCB model or normalized PCB sidecar.
     * @returns {object}
     */
    static build(pcb = {}) {
        const board = sourceBoard(pcb)
        const declaredRows = declaredLayerRows(pcb, board)
        const declaredByKey = new Map(
            declaredRows.map((row) => [row.layerKey, row])
        )
        const declaredByOrdinal = new Map(
            declaredRows
                .filter((row) => Number.isInteger(row.ordinal))
                .map((row) => [row.ordinal, row])
        )
        const uses = layerUseRows(pcb, board, declaredByOrdinal)
        const useGroups = useGroupsByLayer(uses)
        const layerKeys = orderedLayerKeys(declaredRows, useGroups)
        const layers = layerKeys.map((layerKey) =>
            layerRow(layerKey, declaredByKey.get(layerKey), useGroups[layerKey])
        )
        const diagnostics = diagnosticsForLayers(layers)

        return {
            schema: schemaId,
            summary: summaryForLayers(layers, uses, diagnostics),
            layers,
            layersByKey: Object.fromEntries(
                layers.map((layer) => [layer.layerKey, layer])
            ),
            diagnostics,
            indexes: {
                layersByUse: layersByUse(layers),
                layerKeysByClass: keysBy(layers, 'layerClass'),
                layerKeysByKind: layerKeysByKind(layers)
            }
        }
    }
}

/**
 * Resolves the raw KiCad board model from normalized wrappers.
 * @param {object} pcb Candidate PCB object.
 * @returns {object}
 */
function sourceBoard(pcb) {
    return pcb?.kicadBoard || pcb?.pcb?.kicadBoard || pcb?.pcb || pcb || {}
}

/**
 * Builds declared layer rows.
 * @param {object} pcb Normalized PCB model.
 * @param {object} board Raw board model.
 * @returns {object[]}
 */
function declaredLayerRows(pcb, board) {
    const sources = firstNonEmptyArray(
        pcb.layerDefinitions,
        board.layers,
        pcb.layers
    )
    return sources
        .map((layer, index) => declaredLayerRow(layer, index))
        .filter((layer) => layer.layerKey)
}

/**
 * Builds one declared layer row.
 * @param {object} layer Layer metadata.
 * @param {number} index Fallback index.
 * @returns {object}
 */
function declaredLayerRow(layer, index) {
    const layerKey = String(
        layer?.layerKey || layer?.name || layer?.canonicalName || ''
    )
    return stripUndefined({
        layerKey,
        ordinal: optionalInteger(
            layer?.ordinal ?? layer?.layerId ?? layer?.index ?? index
        ),
        type: String(layer?.type || ''),
        userName: String(layer?.userName || '')
    })
}

/**
 * Returns the first non-empty array.
 * @param {...unknown[]} values Candidate arrays.
 * @returns {object[]}
 */
function firstNonEmptyArray(...values) {
    return (
        values.find((value) => Array.isArray(value) && value.length > 0) || []
    )
}

/**
 * Builds primitive layer use rows.
 * @param {object} pcb Normalized PCB model.
 * @param {object} board Raw board model.
 * @param {Map<number, object>} declaredByOrdinal Declared layer lookup.
 * @returns {object[]}
 */
function layerUseRows(pcb, board, declaredByOrdinal) {
    const rows = []
    collectCollection(rows, pcb.tracks, 'track', declaredByOrdinal)
    collectCollection(rows, pcb.arcs, 'arc', declaredByOrdinal)
    collectCollection(rows, pcb.vias, 'via', declaredByOrdinal)
    collectCollection(rows, pcb.pads, 'pad', declaredByOrdinal)
    collectCollection(rows, pcb.polygons, 'polygon', declaredByOrdinal)
    collectCollection(rows, pcb.fills, 'fill', declaredByOrdinal)
    collectCollection(rows, pcb.regions, 'region', declaredByOrdinal)
    collectCollection(rows, pcb.shapeBasedRegions, 'region', declaredByOrdinal)
    collectCollection(rows, pcb.boardRegions, 'region', declaredByOrdinal)
    if (board === pcb || pcb.zoneSemantics !== board.zoneSemantics) {
        collectCollection(rows, pcb.zoneSemantics, 'zone', declaredByOrdinal)
    }
    collectCollection(rows, pcb.texts, 'text', declaredByOrdinal)
    collectCollection(rows, pcb.drawings, 'drawing', declaredByOrdinal)

    if (board !== pcb) {
        collectCollection(rows, board.zoneSemantics, 'zone', declaredByOrdinal)
        collectCollection(
            rows,
            (board.drawings || []).filter(isVisibleBoardDrawing),
            'drawing',
            declaredByOrdinal
        )
        collectCollection(rows, board.outlines, 'outline', declaredByOrdinal)
    }

    return rows
}

/**
 * Collects layer uses from one primitive collection.
 * @param {object[]} rows Output rows.
 * @param {object[] | undefined} values Primitive rows.
 * @param {string} kind Use kind.
 * @param {Map<number, object>} declaredByOrdinal Declared layer lookup.
 * @returns {void}
 */
function collectCollection(rows, values, kind, declaredByOrdinal) {
    for (const value of values || []) {
        for (const layerKey of layerKeysForValue(value, declaredByOrdinal)) {
            rows.push({ layerKey, kind })
        }
    }
}

/**
 * Returns true for raw board drawings not covered by normalized route rows.
 * @param {object} drawing Raw drawing.
 * @returns {boolean}
 */
function isVisibleBoardDrawing(drawing) {
    return !['segment', 'arc', 'via', 'zone'].includes(
        String(drawing?.type || drawing?.sourceType || '')
    )
}

/**
 * Resolves layer keys from one primitive row.
 * @param {object} value Primitive row.
 * @param {Map<number, object>} declaredByOrdinal Declared layer lookup.
 * @returns {string[]}
 */
function layerKeysForValue(value, declaredByOrdinal) {
    const explicitLayers = []
    if (Array.isArray(value?.layers)) explicitLayers.push(...value.layers)
    if (Array.isArray(value?.layerKeys)) explicitLayers.push(...value.layerKeys)

    const scalar = firstString(
        value?.layerKey,
        value?.layer,
        value?.layerName,
        value?.canonicalName,
        value?.name
    )
    if (scalar) explicitLayers.push(scalar)

    const layerId = optionalInteger(value?.layerId ?? value?.ordinal)
    if (Number.isInteger(layerId) && declaredByOrdinal.has(layerId)) {
        explicitLayers.push(declaredByOrdinal.get(layerId).layerKey)
    }

    return uniqueStrings(explicitLayers.flatMap(splitLayerKey))
}

/**
 * Returns the first non-empty string.
 * @param {...unknown[]} values Candidate values.
 * @returns {string}
 */
function firstString(...values) {
    return String(values.find((value) => String(value || '').trim()) || '')
}

/**
 * Splits compound layer descriptors.
 * @param {unknown} value Candidate layer key.
 * @returns {string[]}
 */
function splitLayerKey(value) {
    return String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
}

/**
 * Groups use rows by layer key.
 * @param {object[]} uses Use rows.
 * @returns {Record<string, object>}
 */
function useGroupsByLayer(uses) {
    const groups = {}
    for (const use of uses) {
        if (!use.layerKey) continue
        groups[use.layerKey] ||= { useCount: 0, useKinds: new Set() }
        groups[use.layerKey].useCount += 1
        groups[use.layerKey].useKinds.add(use.kind)
    }
    return groups
}

/**
 * Orders declared layers first, then undeclared used layers.
 * @param {object[]} declaredRows Declared rows.
 * @param {Record<string, object>} useGroups Use groups.
 * @returns {string[]}
 */
function orderedLayerKeys(declaredRows, useGroups) {
    const declaredKeys = declaredRows.map((row) => row.layerKey)
    const undeclaredKeys = Object.keys(useGroups)
        .filter((key) => !declaredKeys.includes(key))
        .sort(localeCompare)
    return [...declaredKeys, ...undeclaredKeys]
}

/**
 * Builds one final layer row.
 * @param {string} layerKey Layer key.
 * @param {object | undefined} declared Declared layer row.
 * @param {object | undefined} useGroup Use group.
 * @returns {object}
 */
function layerRow(layerKey, declared, useGroup) {
    const metadata = KicadLayerResolver.metadataForLayer(layerKey)
    const useKinds = sortedStrings([...(useGroup?.useKinds || [])])
    return stripUndefined({
        layerKey,
        ordinal: optionalInteger(declared?.ordinal ?? metadata.ordinal),
        declared: Boolean(declared),
        used: Number(useGroup?.useCount || 0) > 0,
        useCount: Number(useGroup?.useCount || 0),
        useKinds,
        type: String(declared?.type || ''),
        userName: String(declared?.userName || ''),
        side: metadata.side,
        layerClass: metadata.isCopper ? 'copper' : metadata.layerClass,
        isCopper: metadata.isCopper,
        isTechnical: metadata.isTechnical
    })
}

/**
 * Builds usage diagnostics.
 * @param {object[]} layers Layer rows.
 * @returns {object[]}
 */
function diagnosticsForLayers(layers) {
    return layers
        .filter((layer) => layer.used && !layer.declared)
        .map((layer) => ({
            code: 'kicad.pcb.layer-usage.undeclared-used-layer',
            severity: 'warning',
            layerKey: layer.layerKey,
            message:
                'KiCad PCB uses a layer that is not present in the declared layer table.'
        }))
}

/**
 * Builds the report summary.
 * @param {object[]} layers Layer rows.
 * @param {object[]} uses Use rows.
 * @param {object[]} diagnostics Diagnostics rows.
 * @returns {object}
 */
function summaryForLayers(layers, uses, diagnostics) {
    return {
        declaredLayerCount: layers.filter((layer) => layer.declared).length,
        usedLayerCount: layers.filter((layer) => layer.used).length,
        declaredUsedLayerCount: layers.filter(
            (layer) => layer.declared && layer.used
        ).length,
        declaredUnusedLayerCount: layers.filter(
            (layer) => layer.declared && !layer.used
        ).length,
        undeclaredUsedLayerCount: layers.filter(
            (layer) => !layer.declared && layer.used
        ).length,
        useRecordCount: uses.length,
        diagnosticCount: diagnostics.length
    }
}

/**
 * Builds layer usage indexes.
 * @param {object[]} layers Layer rows.
 * @returns {Record<string, string[]>}
 */
function layersByUse(layers) {
    return {
        used: layers
            .filter((layer) => layer.used)
            .map((layer) => layer.layerKey),
        unusedDeclared: layers
            .filter((layer) => layer.declared && !layer.used)
            .map((layer) => layer.layerKey),
        undeclaredUsed: layers
            .filter((layer) => !layer.declared && layer.used)
            .map((layer) => layer.layerKey)
    }
}

/**
 * Groups layer keys by one row field.
 * @param {object[]} layers Layer rows.
 * @param {string} field Field name.
 * @returns {Record<string, string[]>}
 */
function keysBy(layers, field) {
    const groups = {}
    for (const layer of layers) {
        const key = String(layer[field] || '')
        if (!key) continue
        groups[key] ||= []
        groups[key].push(layer.layerKey)
    }
    return Object.fromEntries(Object.entries(groups).sort())
}

/**
 * Groups layer keys by use kind.
 * @param {object[]} layers Layer rows.
 * @returns {Record<string, string[]>}
 */
function layerKeysByKind(layers) {
    const groups = {}
    for (const layer of layers) {
        for (const kind of layer.useKinds || []) {
            groups[kind] ||= []
            groups[kind].push(layer.layerKey)
        }
    }
    return Object.fromEntries(
        Object.entries(groups)
            .map(([kind, layerKeys]) => [kind, sortedStrings(layerKeys)])
            .sort()
    )
}

/**
 * Deduplicates strings while preserving first occurrence order.
 * @param {unknown[]} values Source values.
 * @returns {string[]}
 */
function uniqueStrings(values) {
    return [
        ...new Set(
            (values || [])
                .map((value) => String(value || '').trim())
                .filter(Boolean)
        )
    ]
}

/**
 * Sorts and deduplicates strings naturally.
 * @param {string[]} values Source values.
 * @returns {string[]}
 */
function sortedStrings(values) {
    return uniqueStrings(values).sort(localeCompare)
}

/**
 * Parses an optional integer.
 * @param {unknown} value Candidate value.
 * @returns {number | null}
 */
function optionalInteger(value) {
    const number = Number(value)
    return Number.isInteger(number) ? number : null
}

/**
 * Compares strings with numeric ordering.
 * @param {string} left Left string.
 * @param {string} right Right string.
 * @returns {number}
 */
function localeCompare(left, right) {
    return String(left).localeCompare(String(right), undefined, {
        numeric: true
    })
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
