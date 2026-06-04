// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schemaId = 'kicad-toolkit.schematic.connectivity-qa.a1'

/**
 * Builds deterministic read-only schematic connectivity QA findings.
 */
export class KicadSchematicConnectivityQaBuilder {
    /**
     * Builds connectivity QA from a normalized KiCad schematic model.
     * @param {object} input Schematic model or document wrapper.
     * @returns {object}
     */
    static build(input) {
        const schematic = input?.schematic || input || {}
        const nets = Array.isArray(schematic.nets) ? schematic.nets : []
        const labels = (schematic.texts || []).filter(isWireLabel)
        const sheetEntries = Array.isArray(schematic.sheetEntries)
            ? schematic.sheetEntries
            : []
        const pins = Array.isArray(schematic.pins) ? schematic.pins : []
        const junctions = Array.isArray(schematic.junctions)
            ? schematic.junctions
            : []
        const noConnects = Array.isArray(schematic.crosses)
            ? schematic.crosses
            : []
        const findings = [
            ...implicitNetFindings(nets),
            ...danglingLabelFindings(labels, nets),
            ...orphanSheetEntryFindings(sheetEntries, nets),
            ...unconnectedPinFindings(pins, nets, noConnects),
            ...ambiguousJunctionFindings(junctions, nets)
        ]

        return {
            schema: schemaId,
            summary: summary(nets, findings),
            findings
        }
    }
}

/**
 * Returns true for KiCad wire-label text rows.
 * @param {object} text Text row.
 * @returns {boolean}
 */
function isWireLabel(text) {
    return String(text?.recordType || '') === '25' && Boolean(text?.text)
}

/**
 * Reports nets that received a synthesized name.
 * @param {object[]} nets Normalized nets.
 * @returns {object[]}
 */
function implicitNetFindings(nets) {
    return nets
        .filter((net) => /^UnknownNet\d+$/u.test(String(net.name || '')))
        .map((net) => ({
            code: 'schematic.connectivity.implicit-net-name',
            severity: 'info',
            netName: net.name,
            segmentCount: (net.segments || []).length
        }))
}

/**
 * Reports wire labels not assigned to any net.
 * @param {object[]} labels Label rows.
 * @param {object[]} nets Net rows.
 * @returns {object[]}
 */
function danglingLabelFindings(labels, nets) {
    return labels
        .filter((label) => {
            return !nets.some((net) =>
                (net.labels || []).some((netLabel) =>
                    sameTextPoint(label, netLabel)
                )
            )
        })
        .map((label) => ({
            code: 'schematic.connectivity.dangling-label',
            severity: 'warning',
            text: label.text,
            x: label.x,
            y: label.y
        }))
}

/**
 * Reports sheet entries not assigned to any net.
 * @param {object[]} sheetEntries Sheet entry rows.
 * @param {object[]} nets Net rows.
 * @returns {object[]}
 */
function orphanSheetEntryFindings(sheetEntries, nets) {
    return sheetEntries
        .filter((entry) => {
            return !nets.some((net) =>
                (net.sheetEntries || []).some((netEntry) =>
                    sameNamedPoint(entry, netEntry)
                )
            )
        })
        .map((entry) => ({
            code: 'schematic.connectivity.orphan-sheet-entry',
            severity: 'warning',
            name: entry.name,
            x: entry.x,
            y: entry.y
        }))
}

/**
 * Reports visible pins not assigned to any net and not marked no-connect.
 * @param {object[]} pins Pin rows.
 * @param {object[]} nets Net rows.
 * @param {object[]} noConnects KiCad no-connect markers.
 * @returns {object[]}
 */
function unconnectedPinFindings(pins, nets, noConnects) {
    return pins
        .filter((pin) => pin.visible !== false)
        .filter((pin) => !noConnects.some((cross) => samePoint(pin, cross)))
        .filter((pin) => {
            return !nets.some((net) =>
                (net.pins || []).some((netPin) => samePin(pin, netPin))
            )
        })
        .map((pin) => ({
            code: 'schematic.connectivity.unconnected-pin',
            severity: 'warning',
            ownerIndex: pin.ownerIndex,
            designator: pin.designator,
            name: pin.name,
            x: pin.x,
            y: pin.y
        }))
}

/**
 * Reports authored junctions that do not participate in any net.
 * @param {object[]} junctions Junction rows.
 * @param {object[]} nets Net rows.
 * @returns {object[]}
 */
function ambiguousJunctionFindings(junctions, nets) {
    return junctions
        .filter((junction) => {
            return !nets.some((net) =>
                (net.junctions || []).some((netJunction) =>
                    samePoint(junction, netJunction)
                )
            )
        })
        .map((junction) => ({
            code: 'schematic.connectivity.ambiguous-junction',
            severity: 'warning',
            x: junction.x,
            y: junction.y
        }))
}

/**
 * Builds finding counters.
 * @param {object[]} nets Net rows.
 * @param {object[]} findings Finding rows.
 * @returns {object}
 */
function summary(nets, findings) {
    return {
        netCount: nets.length,
        findingCount: findings.length,
        danglingLabelCount: countCode(
            findings,
            'schematic.connectivity.dangling-label'
        ),
        orphanSheetEntryCount: countCode(
            findings,
            'schematic.connectivity.orphan-sheet-entry'
        ),
        unconnectedPinCount: countCode(
            findings,
            'schematic.connectivity.unconnected-pin'
        ),
        implicitNetCount: countCode(
            findings,
            'schematic.connectivity.implicit-net-name'
        ),
        ambiguousJunctionCount: countCode(
            findings,
            'schematic.connectivity.ambiguous-junction'
        )
    }
}

/**
 * Counts findings with one code.
 * @param {object[]} findings Finding rows.
 * @param {string} code Finding code.
 * @returns {number}
 */
function countCode(findings, code) {
    return findings.filter((finding) => finding.code === code).length
}

/**
 * Compares labels by text and point.
 * @param {object} left First row.
 * @param {object} right Second row.
 * @returns {boolean}
 */
function sameTextPoint(left, right) {
    return (
        String(left.text || '') === String(right.text || '') &&
        samePoint(left, right)
    )
}

/**
 * Compares named sheet entries by name and point.
 * @param {object} left First row.
 * @param {object} right Second row.
 * @returns {boolean}
 */
function sameNamedPoint(left, right) {
    return (
        String(left.name || '') === String(right.name || '') &&
        samePoint(left, right)
    )
}

/**
 * Compares pins by identity or endpoint point.
 * @param {object} left First pin.
 * @param {object} right Second pin.
 * @returns {boolean}
 */
function samePin(left, right) {
    const leftIdentity =
        String(left.ownerIndex || '') + '\u0000' + String(left.designator || '')
    const rightIdentity =
        String(right.ownerIndex || '') +
        '\u0000' +
        String(right.designator || '')
    return leftIdentity === rightIdentity || samePoint(left, right)
}

/**
 * Compares points with parser tolerance.
 * @param {object} left First point.
 * @param {object} right Second point.
 * @returns {boolean}
 */
function samePoint(left, right) {
    return (
        Math.abs(Number(left?.x) - Number(right?.x)) <= 0.01 &&
        Math.abs(Number(left?.y) - Number(right?.y)) <= 0.01
    )
}
