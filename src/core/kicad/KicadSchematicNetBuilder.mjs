// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Builds schematic net rows from parsed KiCad schematic primitives.
 */
export class KicadSchematicNetBuilder {
    /**
     * Builds schematic nets for one sheet.
     * @param {object} schematic Schematic primitive collection.
     * @returns {{ nets: object[], diagnostics: object[] }}
     */
    static build(schematic) {
        const diagnostics = []
        const wireLines = (schematic.lines || []).filter(
            (line) => !line.ownerIndex && line.isBus !== true
        )
        const groups = KicadSchematicNetBuilder.#groupConnectedSegments(
            wireLines,
            schematic.junctions || []
        )
        const namedPointNets = (schematic.texts || [])
            .filter((text) => KicadSchematicNetBuilder.#isNamedNetText(text))
            .map((text) => ({
                name: text.text,
                segments: [],
                labels: [text],
                powerPorts: KicadSchematicNetBuilder.#powerPortsForText(
                    text,
                    schematic.pins || []
                ),
                pins: [],
                junctions: [],
                sheetEntries: []
            }))

        const wireNets = groups.map((group, index) => {
            return KicadSchematicNetBuilder.#wireNet(group, index, schematic)
        })

        return {
            nets: KicadSchematicNetBuilder.#dedupeByName([
                ...wireNets,
                ...namedPointNets
            ]),
            diagnostics
        }
    }

    /**
     * Builds one wire-backed net row.
     * @param {object[]} group Connected wire segments.
     * @param {number} index Net index.
     * @param {object} schematic Schematic primitive collection.
     * @returns {object}
     */
    static #wireNet(group, index, schematic) {
        const labels = (schematic.texts || []).filter(
            (text) =>
                text.recordType === '25' &&
                group.some((line) =>
                    KicadSchematicNetBuilder.#lineContainsPoint(line, text)
                )
        )
        const pins = (schematic.pins || []).filter((pin) =>
            group.some((line) =>
                KicadSchematicNetBuilder.#lineContainsPoint(
                    line,
                    KicadSchematicNetBuilder.#pinConnectionPoint(pin)
                )
            )
        )
        const junctions = (schematic.junctions || []).filter((junction) =>
            group.some((line) =>
                KicadSchematicNetBuilder.#lineContainsPoint(line, junction)
            )
        )
        const sheetEntries = (schematic.sheetEntries || []).filter((entry) =>
            group.some((line) =>
                KicadSchematicNetBuilder.#lineContainsPoint(line, entry)
            )
        )

        return {
            name: labels[0]?.text || `UnknownNet${index}`,
            segments: group,
            labels,
            powerPorts: pins.filter((pin) => pin.symbolKind === 'power'),
            pins,
            ports: [],
            junctions,
            busEntries: [],
            sheetEntries
        }
    }

    /**
     * Checks whether a text row names a schematic net.
     * @param {object} text Schematic text row.
     * @returns {boolean}
     */
    static #isNamedNetText(text) {
        if (!text?.text) return false
        if (text.recordType === '25') return true

        return text.symbolKind === 'power' && text.propertyName === 'Value'
    }

    /**
     * Returns power-symbol pins owned by the same schematic symbol as a text row.
     * @param {object} text Schematic text row.
     * @param {object[]} pins Schematic pins.
     * @returns {object[]}
     */
    static #powerPortsForText(text, pins) {
        if (text.symbolKind !== 'power') return []
        return pins.filter((pin) => {
            return (
                pin.symbolKind === 'power' &&
                String(pin.ownerIndex || '') === String(text.ownerIndex || '')
            )
        })
    }

    /**
     * Deduplicates nets with the same explicit name.
     * @param {object[]} nets Nets.
     * @returns {object[]}
     */
    static #dedupeByName(nets) {
        const byName = new Map()
        for (const net of nets) {
            if (!byName.has(net.name)) {
                byName.set(net.name, net)
                continue
            }
            const existing = byName.get(net.name)
            existing.segments.push(...(net.segments || []))
            existing.labels.push(...(net.labels || []))
            existing.powerPorts.push(...(net.powerPorts || []))
            existing.pins.push(...(net.pins || []))
            existing.junctions.push(...(net.junctions || []))
            existing.sheetEntries.push(...(net.sheetEntries || []))
        }
        return [...byName.values()]
    }

    /**
     * Groups connected wire segments.
     * @param {object[]} segments Wire segments.
     * @param {object[]} junctions Junctions.
     * @returns {object[][]}
     */
    static #groupConnectedSegments(segments, junctions) {
        const groups = []
        for (const segment of segments) {
            const connectedGroups = groups.filter((group) =>
                group.some((other) =>
                    KicadSchematicNetBuilder.#segmentsTouch(
                        segment,
                        other,
                        junctions
                    )
                )
            )
            if (!connectedGroups.length) {
                groups.push([segment])
                continue
            }
            connectedGroups[0].push(segment)
            for (const extra of connectedGroups.slice(1)) {
                connectedGroups[0].push(...extra)
                groups.splice(groups.indexOf(extra), 1)
            }
        }
        return groups
    }

    /**
     * Checks if two wire segments are connected.
     * @param {object} left First segment.
     * @param {object} right Second segment.
     * @param {object[]} junctions Junctions.
     * @returns {boolean}
     */
    static #segmentsTouch(left, right, junctions) {
        const endpoints = [
            { x: left.x1, y: left.y1 },
            { x: left.x2, y: left.y2 }
        ]
        const rightEndpoints = [
            { x: right.x1, y: right.y1 },
            { x: right.x2, y: right.y2 }
        ]
        if (
            endpoints.some((point) =>
                rightEndpoints.some((other) =>
                    KicadSchematicNetBuilder.#pointsEqual(point, other)
                )
            )
        ) {
            return true
        }
        return junctions.some(
            (junction) =>
                KicadSchematicNetBuilder.#lineContainsPoint(left, junction) &&
                KicadSchematicNetBuilder.#lineContainsPoint(right, junction)
        )
    }

    /**
     * Resolves a pin connection point.
     * @param {object} pin Pin.
     * @returns {{ x: number, y: number }}
     */
    static #pinConnectionPoint(pin) {
        if (pin.orientation === 'left') {
            return { x: pin.x - pin.length, y: pin.y }
        }
        if (pin.orientation === 'right') {
            return { x: pin.x + pin.length, y: pin.y }
        }
        if (pin.orientation === 'top')
            return { x: pin.x, y: pin.y - pin.length }
        return { x: pin.x, y: pin.y + pin.length }
    }

    /**
     * Checks if a point lies on a segment.
     * @param {object} line Line segment.
     * @param {{ x: number, y: number }} point Point.
     * @returns {boolean}
     */
    static #lineContainsPoint(line, point) {
        const x1 = Number(line.x1) || 0
        const y1 = Number(line.y1) || 0
        const x2 = Number(line.x2) || 0
        const y2 = Number(line.y2) || 0
        const px = Number(point?.x) || 0
        const py = Number(point?.y) || 0
        const tolerance = 0.01

        if (
            px < Math.min(x1, x2) - tolerance ||
            px > Math.max(x1, x2) + tolerance ||
            py < Math.min(y1, y2) - tolerance ||
            py > Math.max(y1, y2) + tolerance
        ) {
            return false
        }

        const dx = x2 - x1
        const dy = y2 - y1
        const lengthSquared = dx * dx + dy * dy
        if (lengthSquared < tolerance * tolerance) {
            return KicadSchematicNetBuilder.#pointsEqual(
                { x: x1, y: y1 },
                { x: px, y: py }
            )
        }

        const cross = (px - x1) * dy - (py - y1) * dx
        return Math.abs(cross) <= tolerance * Math.sqrt(lengthSquared)
    }

    /**
     * Checks point equality with KiCad coordinate tolerance.
     * @param {{ x: number, y: number }} left First point.
     * @param {{ x: number, y: number }} right Second point.
     * @returns {boolean}
     */
    static #pointsEqual(left, right) {
        return (
            Math.abs(left.x - right.x) < 0.01 &&
            Math.abs(left.y - right.y) < 0.01
        )
    }
}
