// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schemaId = 'kicad-toolkit.pcb.route-analysis.a1'

/**
 * Builds deterministic routed-net summaries from normalized KiCad PCB copper.
 */
export class KicadPcbRouteAnalysisBuilder {
    /**
     * Builds a route-analysis read model.
     * @param {object} pcb Normalized KiCad PCB model.
     * @returns {object}
     */
    static build(pcb = {}) {
        const layerLookup = layerLookupForPcb(pcb)
        const routePrimitives = routePrimitiveRows(pcb, layerLookup)
        const viaRows = viaRowsForPcb(pcb, layerLookup)
        const byNet = netRowsForPcb(pcb, routePrimitives, viaRows)

        return {
            schema: schemaId,
            units: {
                coordinate: 'mil',
                length: 'mil',
                angle: 'deg'
            },
            summary: summaryForPcb(pcb, routePrimitives, viaRows, byNet),
            byNet,
            classes: classRowsForPcb(pcb, byNet),
            differentialPairs: differentialPairRowsForPcb(pcb, byNet)
        }
    }
}

/**
 * Builds a layer lookup from declared and primitive layer metadata.
 * @param {object} pcb Normalized PCB model.
 * @returns {{ byId: Map<number, object>, byKey: Map<string, object> }}
 */
function layerLookupForPcb(pcb) {
    const byId = new Map()
    const byKey = new Map()

    for (const layer of [
        ...(pcb.layers || []),
        ...(pcb.primitiveLayers || [])
    ]) {
        const record = layerRecord(layer)
        if (!record.layerKey) continue
        byKey.set(record.layerKey, record)
        if (Number.isInteger(record.layerId) && !byId.has(record.layerId)) {
            byId.set(record.layerId, record)
        }
    }

    return { byId, byKey }
}

/**
 * Normalizes one layer metadata row.
 * @param {object} layer Layer row.
 * @returns {object}
 */
function layerRecord(layer) {
    const layerKey = String(
        layer?.layerKey || layer?.name || layer?.canonicalName || ''
    )
    const layerId = optionalInteger(layer?.layerId ?? layer?.ordinal)

    return stripUndefined({
        layerId,
        layerKey,
        displayName:
            layer?.displayName ||
            layer?.userName ||
            layer?.name ||
            layer?.canonicalName ||
            layerKey
    })
}

/**
 * Builds route primitive rows for tracks and arcs.
 * @param {object} pcb Normalized PCB model.
 * @param {object} layerLookup Layer lookup.
 * @returns {object[]}
 */
function routePrimitiveRows(pcb, layerLookup) {
    return [
        ...(pcb.tracks || []).map((track, index) =>
            trackRow(track, index, layerLookup)
        ),
        ...(pcb.arcs || []).map((arc, index) => arcRow(arc, index, layerLookup))
    ].filter((primitive) => primitive.netName && primitive.lengthMil > 0)
}

/**
 * Builds one track route row.
 * @param {object} track Track primitive.
 * @param {number} index Track index.
 * @param {object} layerLookup Layer lookup.
 * @returns {object}
 */
function trackRow(track, index, layerLookup) {
    const layer = primitiveLayer(track, layerLookup)
    const start = point(track.x1, track.y1)
    const end = point(track.x2, track.y2)

    return stripUndefined({
        primitiveKey: 'track-' + index,
        kind: 'track',
        netName: netName(track),
        layerKey: layer.layerKey,
        layerDisplayName: layer.displayName,
        lengthMil: round(distance(start, end)),
        endpoints: [start, end]
    })
}

/**
 * Builds one arc route row.
 * @param {object} arc Arc primitive.
 * @param {number} index Arc index.
 * @param {object} layerLookup Layer lookup.
 * @returns {object}
 */
function arcRow(arc, index, layerLookup) {
    const layer = primitiveLayer(arc, layerLookup)
    const radius = Number(arc.radius || 0)

    return stripUndefined({
        primitiveKey: 'arc-' + index,
        kind: 'arc',
        netName: netName(arc),
        layerKey: layer.layerKey,
        layerDisplayName: layer.displayName,
        lengthMil: round(radius * Math.abs(sweepRadians(arc))),
        endpoints: arcEndpoints(arc)
    })
}

/**
 * Builds via rows.
 * @param {object} pcb Normalized PCB model.
 * @param {object} layerLookup Layer lookup.
 * @returns {object[]}
 */
function viaRowsForPcb(pcb, layerLookup) {
    return (pcb.vias || [])
        .map((via, index) => {
            const layer = primitiveLayer(via, layerLookup, {
                fallbackKey: 'via',
                fallbackDisplayName: 'via'
            })

            return stripUndefined({
                primitiveKey: 'via-' + index,
                kind: 'via',
                netName: netName(via),
                layerKey: layer.layerKey,
                layerDisplayName: layer.displayName,
                point: point(via.x, via.y)
            })
        })
        .filter((via) => via.netName)
}

/**
 * Builds deterministic net rows.
 * @param {object} pcb Normalized PCB model.
 * @param {object[]} routePrimitives Route primitive rows.
 * @param {object[]} viaRows Via rows.
 * @returns {object[]}
 */
function netRowsForPcb(pcb, routePrimitives, viaRows) {
    const orderedNetNames = orderedNetNamesForPcb(pcb, routePrimitives, viaRows)

    return orderedNetNames.map((name) =>
        netRow(
            name,
            routePrimitives.filter((primitive) => primitive.netName === name),
            viaRows.filter((via) => via.netName === name)
        )
    )
}

/**
 * Collects net names using KiCad declaration order first.
 * @param {object} pcb Normalized PCB model.
 * @param {object[]} routePrimitives Route primitive rows.
 * @param {object[]} viaRows Via rows.
 * @returns {string[]}
 */
function orderedNetNamesForPcb(pcb, routePrimitives, viaRows) {
    const seen = new Set()
    const names = []

    for (const net of pcb.nets || []) {
        const name = String(net?.name || '').trim()
        if (!name || seen.has(name)) continue
        seen.add(name)
        names.push(name)
    }

    const extraNames = [...routePrimitives, ...viaRows]
        .map((primitive) => primitive.netName)
        .filter((name) => name && !seen.has(name))
        .sort(localeCompare)

    return [...names, ...extraNames]
}

/**
 * Builds one net route row.
 * @param {string} name Net name.
 * @param {object[]} primitives Route primitive rows.
 * @param {object[]} vias Via rows.
 * @returns {object}
 */
function netRow(name, primitives, vias) {
    const trackRows = primitives.filter(
        (primitive) => primitive.kind === 'track'
    )
    const arcRows = primitives.filter((primitive) => primitive.kind === 'arc')

    return {
        name,
        netName: name,
        routed: primitives.length > 0 || vias.length > 0,
        routePrimitiveCount: primitives.length,
        viaCount: vias.length,
        totalLengthMil: sumLength(primitives),
        trackLengthMil: sumLength(trackRows),
        arcLengthMil: sumLength(arcRows),
        layers: layerKeys(primitives),
        layerParticipation: layerParticipationRows(primitives, vias),
        connectedRouteGroups: connectedRouteGroupsForNet(
            name,
            primitives,
            vias
        ),
        primitives,
        vias
    }
}

/**
 * Builds top-level route counters.
 * @param {object} pcb Normalized PCB model.
 * @param {object[]} routePrimitives Route primitive rows.
 * @param {object[]} viaRows Via rows.
 * @param {object[]} byNet Net rows.
 * @returns {object}
 */
function summaryForPcb(pcb, routePrimitives, viaRows, byNet) {
    return {
        netCount: (pcb.nets || []).length || byNet.length,
        routedNetCount: byNet.filter((net) => net.routed).length,
        routePrimitiveCount: routePrimitives.length,
        viaCount: viaRows.length,
        totalLengthMil: sumLength(routePrimitives),
        connectedRouteGroupCount: byNet.reduce((total, net) => {
            return total + (net.connectedRouteGroups || []).length
        }, 0),
        differentialPairCount: differentialPairRowsForPcb(pcb, byNet).length
    }
}

/**
 * Builds route summaries for KiCad net classes.
 * @param {object} pcb Normalized PCB model.
 * @param {object[]} byNet Net rows.
 * @returns {object[]}
 */
function classRowsForPcb(pcb, byNet) {
    const lengthByNet = new Map(
        byNet.map((net) => [
            netNameForRow(net),
            Number(net.totalLengthMil || 0)
        ])
    )

    return (pcb.classes || [])
        .map((classRecord) => {
            const netNames = [
                ...(classRecord?.nets || []),
                ...(classRecord?.members || [])
            ]
                .filter((name, index, all) => {
                    return name && all.indexOf(name) === index
                })
                .sort(localeCompare)

            return stripUndefined({
                name: classRecord?.name,
                netNames,
                totalLengthMil: round(
                    netNames.reduce((total, name) => {
                        return total + Number(lengthByNet.get(name) || 0)
                    }, 0)
                )
            })
        })
        .filter(
            (classRecord) => classRecord.name && classRecord.netNames.length
        )
}

/**
 * Builds differential-pair route rows when PCB sidecars expose pair metadata.
 * @param {object} pcb Normalized PCB model.
 * @param {object[]} byNet Net rows.
 * @returns {object[]}
 */
function differentialPairRowsForPcb(pcb, byNet) {
    const lengthByNet = new Map(
        byNet.map((net) => [
            netNameForRow(net),
            Number(net.totalLengthMil || 0)
        ])
    )

    return (pcb.differentialPairs || [])
        .map((pair) => {
            const positiveNetName = String(
                pair?.positiveNetName ||
                    pair?.positiveNet ||
                    pair?.positive ||
                    ''
            ).trim()
            const negativeNetName = String(
                pair?.negativeNetName ||
                    pair?.negativeNet ||
                    pair?.negative ||
                    ''
            ).trim()
            const positiveLengthMil = round(lengthByNet.get(positiveNetName))
            const negativeLengthMil = round(lengthByNet.get(negativeNetName))

            return stripUndefined({
                name:
                    pair?.name ||
                    [positiveNetName, negativeNetName]
                        .filter(Boolean)
                        .join('/'),
                positiveNetName,
                negativeNetName,
                positiveLengthMil,
                negativeLengthMil,
                skewLengthMil: round(
                    Math.abs(positiveLengthMil - negativeLengthMil)
                ),
                classes: pair?.classes || pair?.classNames || []
            })
        })
        .filter((pair) => {
            return (
                pair.name &&
                (pair.positiveLengthMil > 0 || pair.negativeLengthMil > 0)
            )
        })
        .sort((left, right) => localeCompare(left.name, right.name))
}

/**
 * Builds per-layer route participation rows for one net.
 * @param {object[]} primitives Route primitive rows.
 * @param {object[]} vias Via rows.
 * @returns {object[]}
 */
function layerParticipationRows(primitives, vias) {
    const rowsByLayer = new Map()

    for (const primitive of [...primitives, ...vias]) {
        const layerKey = String(primitive.layerKey || '')
        if (!layerKey) continue
        if (!rowsByLayer.has(layerKey)) {
            rowsByLayer.set(layerKey, {
                layerKey,
                primitiveKeys: [],
                routePrimitiveCount: 0,
                viaCount: 0,
                totalLengthMil: 0
            })
        }

        const row = rowsByLayer.get(layerKey)
        row.primitiveKeys.push(primitive.primitiveKey)
        if (primitive.kind === 'via') {
            row.viaCount += 1
        } else {
            row.routePrimitiveCount += 1
            row.totalLengthMil += Number(primitive.lengthMil || 0)
        }
    }

    return [...rowsByLayer.values()]
        .map((row) => ({
            ...row,
            primitiveKeys: sortedStrings(row.primitiveKeys),
            totalLengthMil: round(row.totalLengthMil)
        }))
        .sort((left, right) => localeCompare(left.layerKey, right.layerKey))
}

/**
 * Builds deterministic layer route groups for one net.
 * @param {string} name Net name.
 * @param {object[]} primitives Route primitive rows.
 * @param {object[]} vias Via rows.
 * @returns {object[]}
 */
function connectedRouteGroupsForNet(name, primitives, vias) {
    return layerParticipationRows(primitives, vias).map((row) => ({
        key: 'route-' + slug(name) + '-' + slug(row.layerKey),
        layerKeys: [row.layerKey],
        primitiveKeys: row.primitiveKeys,
        totalLengthMil: row.totalLengthMil
    }))
}

/**
 * Resolves one primitive layer.
 * @param {object} primitive Primitive row.
 * @param {object} layerLookup Layer lookup.
 * @param {{ fallbackKey?: string, fallbackDisplayName?: string }} [options] Fallback options.
 * @returns {{ layerKey: string, displayName: string }}
 */
function primitiveLayer(primitive, layerLookup, options = {}) {
    const explicitKey = String(
        primitive?.layerKey || primitive?.layer || primitive?.layerName || ''
    )
    if (explicitKey) {
        return (
            layerLookup.byKey.get(explicitKey) || {
                layerKey: explicitKey,
                displayName: explicitKey
            }
        )
    }

    const layerId = optionalInteger(primitive?.layerId ?? primitive?.layerCode)
    if (layerId !== null && layerLookup.byId.has(layerId)) {
        const record = layerLookup.byId.get(layerId)
        return {
            layerKey: record.layerKey,
            displayName: record.displayName
        }
    }

    const fallbackKey = options.fallbackKey || ''
    return {
        layerKey: fallbackKey,
        displayName: options.fallbackDisplayName || fallbackKey
    }
}

/**
 * Resolves a primitive net name.
 * @param {object} primitive Primitive row.
 * @returns {string}
 */
function netName(primitive) {
    return String(primitive?.netName || primitive?.net || '').trim()
}

/**
 * Builds a normalized point.
 * @param {unknown} x X coordinate.
 * @param {unknown} y Y coordinate.
 * @returns {{ x: number, y: number }}
 */
function point(x, y) {
    return { x: round(x), y: round(y) }
}

/**
 * Builds arc endpoints from center, radius, and start/end angles.
 * @param {object} arc Arc primitive.
 * @returns {object[]}
 */
function arcEndpoints(arc) {
    const radius = Number(arc.radius || 0)
    const centerX = Number(arc.x || arc.centerX || 0)
    const centerY = Number(arc.y || arc.centerY || 0)
    const startAngle = degreesToRadians(arc.startAngle)
    const endAngle = degreesToRadians(arc.endAngle)

    return [
        point(
            centerX + radius * Math.cos(startAngle),
            centerY + radius * Math.sin(startAngle)
        ),
        point(
            centerX + radius * Math.cos(endAngle),
            centerY + radius * Math.sin(endAngle)
        )
    ]
}

/**
 * Resolves an arc sweep in radians.
 * @param {object} arc Arc primitive.
 * @returns {number}
 */
function sweepRadians(arc) {
    if (Number.isFinite(Number(arc.sweepAngle))) {
        return degreesToRadians(arc.sweepAngle)
    }

    let sweep = Number(arc.endAngle || 0) - Number(arc.startAngle || 0)
    while (sweep <= -180) sweep += 360
    while (sweep > 180) sweep -= 360
    return degreesToRadians(sweep)
}

/**
 * Converts degrees to radians.
 * @param {unknown} degrees Degree value.
 * @returns {number}
 */
function degreesToRadians(degrees) {
    return (Number(degrees || 0) * Math.PI) / 180
}

/**
 * Returns Euclidean distance.
 * @param {{ x: number, y: number }} start Start point.
 * @param {{ x: number, y: number }} end End point.
 * @returns {number}
 */
function distance(start, end) {
    return Math.hypot(
        Number(end.x) - Number(start.x),
        Number(end.y) - Number(start.y)
    )
}

/**
 * Sums route primitive lengths.
 * @param {object[]} primitives Route primitive rows.
 * @returns {number}
 */
function sumLength(primitives) {
    return round(
        (primitives || []).reduce((total, primitive) => {
            return total + Number(primitive.lengthMil || 0)
        }, 0)
    )
}

/**
 * Returns unique layer keys in primitive order.
 * @param {object[]} primitives Route primitive rows.
 * @returns {string[]}
 */
function layerKeys(primitives) {
    const seen = new Set()
    const keys = []
    for (const primitive of primitives || []) {
        const key = String(primitive.layerKey || '')
        if (!key || seen.has(key)) continue
        seen.add(key)
        keys.push(key)
    }
    return keys
}

/**
 * Resolves a net row name from old and new route-analysis shapes.
 * @param {object} net Net row.
 * @returns {string}
 */
function netNameForRow(net) {
    return String(net?.netName || net?.name || '').trim()
}

/**
 * Sorts and deduplicates string values.
 * @param {string[]} values Source values.
 * @returns {string[]}
 */
function sortedStrings(values) {
    return [...new Set((values || []).filter(Boolean))].sort(localeCompare)
}

/**
 * Converts a value to a lowercase key segment.
 * @param {unknown} value Source value.
 * @returns {string}
 */
function slug(value) {
    return (
        String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/gu, '-')
            .replace(/^-+|-+$/gu, '') || 'item'
    )
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
 * Rounds numeric values for deterministic JSON.
 * @param {unknown} value Numeric value.
 * @returns {number}
 */
function round(value) {
    const number = Number(value || 0)
    return Number.isFinite(number) ? Number(number.toFixed(2)) : 0
}

/**
 * Removes undefined fields while preserving null, false, and zero.
 * @param {Record<string, unknown>} value Source object.
 * @returns {Record<string, unknown>}
 */
function stripUndefined(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(([, entryValue]) => {
            return entryValue !== undefined
        })
    )
}
