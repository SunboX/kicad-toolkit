// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Builds KiCad polygon-pour realization rows for PCB review metadata.
 */
export class KicadPcbReviewPolygonRealizationBuilder {
    /**
     * Builds polygon-pour realization sidecars.
     * @param {object} pcb Normalized KiCad PCB model.
     * @returns {object[]}
     */
    static build(pcb = {}) {
        const rows = [
            ...realizationRows('polygon', pcb.polygons || [], {
                defaultPolygonIndex: true
            }),
            ...realizationRows('zone', pcb.zones || [], {
                defaultPolygonIndex: true
            }),
            ...realizationRows('fill', pcb.fills || []),
            ...realizationRows('region', pcb.regions || []),
            ...realizationRows('board-region', pcb.boardRegions || []),
            ...realizationRows(
                'shape-based-region',
                pcb.shapeBasedRegions || []
            )
        ]
        const groups = new Map()

        for (const row of rows) {
            if (!Number.isFinite(row.polygonIndex)) continue
            const groupKey =
                row.polygonIndex +
                ':' +
                (row.subpolygonIndex ?? '') +
                ':' +
                (row.unionIndex ?? '')
            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    polygonIndex: row.polygonIndex,
                    subpolygonIndex: row.subpolygonIndex,
                    unionIndex: row.unionIndex,
                    isCutout: false,
                    netName: '',
                    layerKeys: new Set(),
                    primitiveKeys: new Set(),
                    realizedPrimitiveKinds: new Set()
                })
            }
            const group = groups.get(groupKey)
            group.isCutout = group.isCutout || row.isCutout === true
            if (!group.netName && row.netName) group.netName = row.netName
            if (row.layerKey) group.layerKeys.add(row.layerKey)
            group.primitiveKeys.add(row.primitiveKey)
            group.realizedPrimitiveKinds.add(row.kind)
        }

        return [...groups.values()]
            .map((group) =>
                stripEmpty({
                    key: 'polygon-realization-' + group.polygonIndex,
                    polygonIndex: group.polygonIndex,
                    subpolygonIndex: group.subpolygonIndex,
                    unionIndex: group.unionIndex,
                    classification: group.isCutout ? 'cutout' : 'copper-pour',
                    layerKeys: sortedStrings([...group.layerKeys]),
                    netName: group.netName,
                    primitiveKeys: sortedStrings([...group.primitiveKeys]),
                    realizedPrimitiveKinds: sortedStrings([
                        ...group.realizedPrimitiveKinds
                    ])
                })
            )
            .sort((left, right) => localeCompare(left.key, right.key))
    }
}

/**
 * Builds primitive realization rows.
 * @param {string} kind Primitive kind.
 * @param {object[]} primitives Primitive rows.
 * @param {{ defaultPolygonIndex?: boolean }} [options] Row options.
 * @returns {object[]}
 */
function realizationRows(kind, primitives, options = {}) {
    return (primitives || []).map((primitive, index) => ({
        kind,
        primitiveKey: kind + '-' + index,
        polygonIndex: optionalNumber(
            primitive?.polygonIndex ??
                (options.defaultPolygonIndex === true ? index : undefined)
        ),
        subpolygonIndex: optionalNumber(
            primitive?.subpolygonIndex ?? primitive?.subpolyIndex
        ),
        unionIndex: optionalNumber(primitive?.unionIndex),
        isCutout:
            primitive?.isCutout === true ||
            primitive?.classification === 'cutout',
        layerKey: layerKey(primitive),
        netName: netName(primitive)
    }))
}

/**
 * Resolves a layer key from a KiCad primitive.
 * @param {object} value Primitive row.
 * @returns {string}
 */
function layerKey(value) {
    return String(
        value?.layerKey ||
            value?.layer ||
            value?.layerName ||
            value?.layerCanonicalName ||
            ''
    ).trim()
}

/**
 * Resolves a net name from a KiCad primitive.
 * @param {object} value Primitive row.
 * @returns {string}
 */
function netName(value) {
    return String(value?.netName || value?.net || '').trim()
}

/**
 * Returns a finite number or undefined.
 * @param {unknown} value Candidate value.
 * @returns {number | undefined}
 */
function optionalNumber(value) {
    const number = Number(value)
    return Number.isFinite(number) ? number : undefined
}

/**
 * Sorts and deduplicates strings naturally.
 * @param {string[]} values Source values.
 * @returns {string[]}
 */
function sortedStrings(values) {
    return [...new Set((values || []).filter(Boolean))].sort(localeCompare)
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
 * Removes empty fields while preserving zeros and false.
 * @param {Record<string, unknown>} value Candidate object.
 * @returns {Record<string, unknown>}
 */
function stripEmpty(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(([, entryValue]) => {
            if (Array.isArray(entryValue)) return entryValue.length > 0
            return (
                entryValue !== null &&
                entryValue !== undefined &&
                entryValue !== ''
            )
        })
    )
}
