// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schemaId = 'kicad-toolkit.pcb.statistics.a1'

/**
 * Builds deterministic PCB QA and statistics summaries for KiCad boards.
 */
export class KicadPcbStatisticsBuilder {
    /**
     * Builds statistics for one normalized KiCad PCB object.
     * @param {object} pcb Normalized PCB model.
     * @returns {object}
     */
    static build(pcb = {}) {
        return {
            schema: schemaId,
            units: {
                coordinate: 'mil',
                length: 'mil',
                board: 'mil',
                drill: 'mil',
                angle: 'deg'
            },
            board: boardStats(pcb.boardOutline || {}),
            drills: drillStats(pcb.pads || [], pcb.vias || []),
            primitiveWidths: primitiveWidthStats(pcb),
            layers: layerStats(pcb),
            planning: planningStats(pcb)
        }
    }
}

/**
 * Builds board outline statistics.
 * @param {object} boardOutline Board outline object.
 * @returns {object}
 */
function boardStats(boardOutline) {
    const widthMil = round(boardOutline.widthMil)
    const heightMil = round(boardOutline.heightMil)
    const minX = Number(boardOutline.minX || 0)
    const minY = Number(boardOutline.minY || 0)

    return {
        widthMil,
        heightMil,
        centroidMil: {
            x: round(minX + widthMil / 2),
            y: round(minY + heightMil / 2)
        },
        outlineSegmentCount: Array.isArray(boardOutline.segments)
            ? boardOutline.segments.length
            : 0,
        cutoutCount: Array.isArray(boardOutline.cutouts)
            ? boardOutline.cutouts.length
            : 0
    }
}

/**
 * Builds drill and slot counters.
 * @param {object[]} pads Pad primitives.
 * @param {object[]} vias Via primitives.
 * @returns {object}
 */
function drillStats(pads, vias) {
    const padHoles = (pads || []).filter(hasHole)
    const viaHoles = (vias || []).filter(hasHole)
    const holes = [...padHoles, ...viaHoles]

    return {
        totalHoleCount: holes.length,
        padHoleCount: padHoles.length,
        viaHoleCount: viaHoles.length,
        platedHoleCount: holes.filter((hole) => hole.isPlated !== false).length,
        nonPlatedHoleCount: holes.filter((hole) => hole.isPlated === false)
            .length,
        slotCount: holes.filter(hasSlot).length,
        holeDiameterMil: histogram(holes.map((hole) => hole.holeDiameter)),
        slotLengthMil: histogram(
            holes.filter(hasSlot).map((hole) => {
                return hole.holeSlotLength || hole.slotLength
            })
        )
    }
}

/**
 * Builds primitive-width histograms.
 * @param {object} pcb Normalized PCB model.
 * @returns {object}
 */
function primitiveWidthStats(pcb) {
    return {
        tracksMil: histogram((pcb.tracks || []).map((track) => track.width)),
        arcsMil: histogram((pcb.arcs || []).map((arc) => arc.width)),
        viasMil: histogram((pcb.vias || []).map((via) => via.diameter)),
        padsTopXMil: histogram((pcb.pads || []).map((pad) => pad.sizeTopX))
    }
}

/**
 * Builds layer statistics.
 * @param {object} pcb Normalized PCB model.
 * @returns {object}
 */
function layerStats(pcb) {
    const entries = layerEntries(pcb).map((layer) => {
        return stripUndefined({
            layerKey: layer.layerKey,
            layerId: layer.layerId,
            displayName: layer.displayName,
            role: layer.role,
            side: layer.side,
            primitiveCounts: primitiveCountsForLayer(pcb, layer)
        })
    })

    return {
        count: entries.length,
        summary: layerSummary(entries),
        entries
    }
}

/**
 * Builds deterministic layer entries from declared and primitive layers.
 * @param {object} pcb Normalized PCB model.
 * @returns {object[]}
 */
function layerEntries(pcb) {
    const byKey = new Map()

    for (const layer of [
        ...(pcb.layers || []),
        ...(pcb.primitiveLayers || [])
    ]) {
        const layerKey = String(
            layer?.layerKey || layer?.name || layer?.canonicalName || ''
        )
        if (!layerKey || byKey.has(layerKey)) continue
        byKey.set(layerKey, {
            layerKey,
            layerId: optionalInteger(layer?.layerId ?? layer?.ordinal),
            displayName:
                layer?.displayName ||
                layer?.userName ||
                layer?.name ||
                layerKey,
            role: layer?.role || layer?.layerClass || layerRole(layerKey),
            side: layer?.side
        })
    }

    for (const primitive of primitiveFamilies(pcb).flatMap(
        (family) => family.items
    )) {
        const layerKey = primitiveLayerKey(primitive)
        if (!layerKey || byKey.has(layerKey)) continue
        byKey.set(layerKey, {
            layerKey,
            layerId: optionalInteger(primitive.layerId ?? primitive.layerCode),
            displayName: layerKey,
            role: layerRole(layerKey)
        })
    }

    return [...byKey.values()]
}

/**
 * Builds per-layer primitive counts.
 * @param {object} pcb Normalized PCB model.
 * @param {object} layer Layer entry.
 * @returns {Record<string, number>}
 */
function primitiveCountsForLayer(pcb, layer) {
    return Object.fromEntries(
        primitiveFamilies(pcb).map((family) => [
            family.name,
            family.items.filter((primitive) =>
                primitiveMatchesLayer(primitive, layer)
            ).length
        ])
    )
}

/**
 * Builds aggregate layer role counts.
 * @param {object[]} entries Layer entries.
 * @returns {object}
 */
function layerSummary(entries) {
    return {
        copperLayerCount: entries.filter((entry) => entry.role === 'copper')
            .length,
        technicalLayerCount: entries.filter((entry) => entry.role !== 'copper')
            .length,
        roles: countBy(entries.map((entry) => entry.role))
    }
}

/**
 * Builds planning statistics for keepouts and board regions.
 * @param {object} pcb Normalized PCB model.
 * @returns {object}
 */
function planningStats(pcb) {
    const regions = pcb.regions || []
    const shapeBasedRegions = pcb.shapeBasedRegions || []
    const boardRegions = pcb.boardRegions || []

    return {
        keepouts: {
            totalCount:
                keepoutCount(regions) +
                keepoutCount(shapeBasedRegions) +
                keepoutCount(boardRegions),
            regionCount: keepoutCount(regions),
            shapeBasedRegionCount: keepoutCount(shapeBasedRegions),
            boardRegionCount: keepoutCount(boardRegions)
        },
        boardRegions: {
            boardRegionCount: boardRegions.length,
            flexRegionCount: boardRegions.filter((region) => {
                return region?.isFlexRegion === true
            }).length,
            rigidRegionCount: boardRegions.filter((region) => {
                return region?.isRigidRegion === true
            }).length
        }
    }
}

/**
 * Returns primitive families included in layer counts.
 * @param {object} pcb Normalized PCB model.
 * @returns {{ name: string, items: object[] }[]}
 */
function primitiveFamilies(pcb) {
    return [
        { name: 'tracks', items: pcb.tracks || [] },
        { name: 'arcs', items: pcb.arcs || [] },
        { name: 'vias', items: pcb.vias || [] },
        { name: 'pads', items: pcb.pads || [] },
        { name: 'texts', items: pcb.texts || [] },
        { name: 'fills', items: pcb.fills || [] },
        { name: 'polygons', items: pcb.polygons || [] },
        { name: 'regions', items: pcb.regions || [] },
        { name: 'shapeBasedRegions', items: pcb.shapeBasedRegions || [] }
    ]
}

/**
 * Checks whether a primitive belongs to one layer entry.
 * @param {object} primitive Primitive.
 * @param {object} layer Layer entry.
 * @returns {boolean}
 */
function primitiveMatchesLayer(primitive, layer) {
    const key = primitiveLayerKey(primitive)
    if (key) return key === layer.layerKey
    const layerId = optionalInteger(primitive.layerId ?? primitive.layerCode)
    return layerId !== null && layerId === layer.layerId
}

/**
 * Resolves a primitive layer key.
 * @param {object} primitive Primitive.
 * @returns {string}
 */
function primitiveLayerKey(primitive) {
    return String(
        primitive?.layerKey || primitive?.layer || primitive?.layerName || ''
    )
}

/**
 * Resolves a compact KiCad layer role.
 * @param {string} layerKey KiCad layer key.
 * @returns {string}
 */
function layerRole(layerKey) {
    const normalized = String(layerKey || '').toLowerCase()
    if (normalized.endsWith('.cu')) return 'copper'
    if (normalized.includes('silk')) return 'silkscreen'
    if (normalized.includes('fab')) return 'fabrication'
    if (normalized.includes('crtyd')) return 'courtyard'
    if (normalized.includes('mask')) return 'mask'
    if (normalized.includes('paste')) return 'paste'
    return 'technical'
}

/**
 * Returns true when a primitive has a drill.
 * @param {object} primitive Primitive object.
 * @returns {boolean}
 */
function hasHole(primitive) {
    return Number(primitive?.holeDiameter || 0) > 0
}

/**
 * Returns true when a drill is a slot.
 * @param {object} primitive Primitive object.
 * @returns {boolean}
 */
function hasSlot(primitive) {
    return (
        Number(primitive?.holeSlotLength || primitive?.slotLength || 0) > 0 ||
        Number(primitive?.holeShape || 0) === 2
    )
}

/**
 * Counts primitives marked as keepouts.
 * @param {object[]} regions Region-like primitives.
 * @returns {number}
 */
function keepoutCount(regions) {
    return (regions || []).filter((region) => region?.isKeepout === true).length
}

/**
 * Builds a numeric histogram from values.
 * @param {unknown[]} values Numeric values.
 * @returns {Record<string, number>}
 */
function histogram(values) {
    const output = {}

    for (const value of values || []) {
        const number = round(value)
        if (!Number.isFinite(number) || number === 0) continue
        output[String(number)] = (output[String(number)] || 0) + 1
    }

    return output
}

/**
 * Counts arbitrary string values.
 * @param {string[]} values Values to count.
 * @returns {Record<string, number>}
 */
function countBy(values) {
    const output = {}

    for (const value of values || []) {
        const key = String(value || '')
        if (!key) continue
        output[key] = (output[key] || 0) + 1
    }

    return Object.fromEntries(Object.entries(output).sort())
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
 * Rounds numeric values for deterministic JSON.
 * @param {unknown} value Numeric value.
 * @returns {number}
 */
function round(value) {
    const number = Number(value || 0)
    return Number.isFinite(number) ? Number(number.toFixed(3)) : 0
}

/**
 * Removes undefined fields from an object.
 * @param {object} value Source object.
 * @returns {object}
 */
function stripUndefined(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(([, entryValue]) => {
            return entryValue !== undefined
        })
    )
}
