// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schemaId = 'kicad-toolkit.pcb.region-semantics.a1'

/**
 * Builds KiCad PCB zone, keepout, and board-region semantic reports.
 */
export class KicadPcbRegionSemanticsBuilder {
    /**
     * Builds a deterministic region semantics report.
     * @param {object} pcb KiCad PCB model or normalized PCB sidecar.
     * @returns {object}
     */
    static build(pcb = {}) {
        const board = sourceBoard(pcb)
        const zones = zoneRows(board.zoneSemantics || [])
        const boardRegions = boardRegionRows(board.boardRegions || [])
        const keepoutZones = zones.filter(
            (zone) => zone.kind === 'keepout-zone'
        )
        const layerKeys = new Set(
            zones.map((zone) => zone.layerKey).filter(Boolean)
        )

        return {
            schema: schemaId,
            summary: {
                zoneCount: zones.length,
                keepoutZoneCount: keepoutZones.length,
                copperZoneCount: zones.filter(
                    (zone) => zone.kind === 'copper-zone'
                ).length,
                boardRegionCount: boardRegions.length,
                flexRegionCount: boardRegions.filter(
                    (region) => region.isFlexRegion === true
                ).length,
                rigidRegionCount: boardRegions.filter(
                    (region) => region.isRigidRegion === true
                ).length,
                keepoutTargetCount: keepoutZones.reduce(
                    (total, zone) => total + keepoutTargetCount(zone),
                    0
                ),
                layerCount: layerKeys.size
            },
            zones,
            boardRegions,
            indexes: {
                zonesByLayer: keysBy(zones, 'layerKey'),
                keepoutZones: keepoutZones.map((zone) => zone.key),
                boardRegionsByLayerStack: keysBy(boardRegions, 'layerStackId')
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
 * Builds normalized zone rows.
 * @param {object[]} zones Parsed zone semantic rows.
 * @returns {object[]}
 */
function zoneRows(zones) {
    return (zones || []).map((zone, index) => {
        const keepoutTargets = normalizeKeepoutTargets(
            zone.keepoutTargets || {}
        )
        return stripEmpty({
            key: 'zone-' + index,
            zoneIndex: optionalInteger(zone.zoneIndex) ?? index,
            kind: isKeepout(keepoutTargets, zone)
                ? 'keepout-zone'
                : 'copper-zone',
            name: String(zone.name || ''),
            layerKey: String(zone.layerKey || zone.layer || ''),
            netName: String(zone.netName || zone.net || ''),
            priority: optionalInteger(zone.priority) ?? 0,
            pointCount: Array.isArray(zone.points) ? zone.points.length : 0,
            keepoutTargets
        })
    })
}

/**
 * Builds normalized board-region rows.
 * @param {object[]} regions Parsed board-region rows.
 * @returns {object[]}
 */
function boardRegionRows(regions) {
    return (regions || []).map((region, index) =>
        stripEmpty({
            key: 'board-region-' + index,
            name: String(region.name || ''),
            layerStackId: String(region.layerStackId || ''),
            isFlexRegion:
                region.isFlexRegion === undefined
                    ? undefined
                    : region.isFlexRegion,
            isRigidRegion:
                region.isRigidRegion === undefined
                    ? undefined
                    : region.isRigidRegion,
            bendingLineCount: optionalInteger(region.bendingLineCount) ?? 0
        })
    )
}

/**
 * Normalizes KiCad keepout target flags.
 * @param {object} targets Source target flags.
 * @returns {Record<string, boolean>}
 */
function normalizeKeepoutTargets(targets) {
    const entries = Object.entries(targets || {})
        .map(([key, value]) => [String(key), value === true])
        .filter(([key]) => key)
    return Object.fromEntries(entries)
}

/**
 * Returns true when a zone has active keepout semantics.
 * @param {Record<string, boolean>} keepoutTargets Keepout targets.
 * @param {object} zone Source zone row.
 * @returns {boolean}
 */
function isKeepout(keepoutTargets, zone) {
    return (
        zone?.isKeepout === true ||
        Object.values(keepoutTargets || {}).some((value) => value === true)
    )
}

/**
 * Counts enabled keepout targets.
 * @param {object} zone Zone row.
 * @returns {number}
 */
function keepoutTargetCount(zone) {
    return Object.values(zone.keepoutTargets || {}).filter(Boolean).length
}

/**
 * Groups row keys by one field.
 * @param {object[]} rows Rows to group.
 * @param {string} field Field name.
 * @returns {Record<string, string[]>}
 */
function keysBy(rows, field) {
    const groups = {}
    for (const row of rows) {
        const key = String(row[field] || '')
        if (!key) continue
        if (!groups[key]) groups[key] = []
        groups[key].push(row.key)
    }
    return Object.fromEntries(Object.entries(groups).sort())
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
 * Removes undefined fields while preserving native empty strings and objects.
 * @param {Record<string, unknown>} value Candidate object.
 * @returns {Record<string, unknown>}
 */
function stripEmpty(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(([, entryValue]) => {
            return entryValue !== undefined
        })
    )
}
