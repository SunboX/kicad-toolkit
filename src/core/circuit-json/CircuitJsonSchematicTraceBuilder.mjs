// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonModelAdapterElements } from './CircuitJsonModelAdapterElements.mjs'
import { CircuitJsonModelAdapterPrimitives } from './CircuitJsonModelAdapterPrimitives.mjs'

const Elements = CircuitJsonModelAdapterElements
const Primitives = CircuitJsonModelAdapterPrimitives

/**
 * Builds grouped Circuit JSON schematic traces from parsed schematic nets.
 */
export class CircuitJsonSchematicTraceBuilder {
    /**
     * Appends grouped schematic traces.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} schematic Parsed schematic model.
     * @param {Map<string, string>} sourceNetIds Source net ids by name.
     * @param {Map<object, string>} sourcePortIds Source port ids by pin object.
     * @param {Map<string, string>} sourcePortIdsByKey Source port ids by stable pin key.
     * @returns {Set<string>} Consumed segment keys.
     */
    static append(
        circuitJson,
        idScope,
        schematic,
        sourceNetIds,
        sourcePortIds,
        sourcePortIdsByKey
    ) {
        const consumedSegmentKeys = new Set()

        for (const [netIndex, net] of Primitives.array(
            schematic.nets
        ).entries()) {
            const segments = Primitives.array(net.segments)
            if (segments.length === 0) continue

            const edges = segments.map((segment) => ({
                from: Primitives.point(segment.x1, segment.y1),
                to: Primitives.point(segment.x2, segment.y2)
            }))
            if (edges.length === 0) continue

            for (const segment of segments) {
                consumedSegmentKeys.add(
                    CircuitJsonSchematicTraceBuilder.segmentKey(segment)
                )
            }

            const netName = Primitives.string(net.name, `NET_${netIndex + 1}`)
            const sourceNetId = CircuitJsonSchematicTraceBuilder.#sourceNetId(
                circuitJson,
                idScope,
                sourceNetIds,
                netName
            )
            const sourceTraceId = Primitives.id(idScope, [
                'source_trace',
                'schematic_net',
                netName || netIndex
            ])
            const connectedSourcePortIds =
                CircuitJsonSchematicTraceBuilder.#connectedSourcePortIds(
                    net,
                    sourcePortIds,
                    sourcePortIdsByKey
                )

            circuitJson.push({
                type: 'source_trace',
                source_trace_id: sourceTraceId,
                connected_source_port_ids: connectedSourcePortIds,
                connected_source_net_ids: [sourceNetId]
            })
            circuitJson.push({
                type: 'schematic_trace',
                schematic_trace_id: Primitives.id(idScope, [
                    'schematic_trace',
                    'net',
                    netName || netIndex
                ]),
                source_trace_id: sourceTraceId,
                junctions: Primitives.array(net.junctions).map((junction) =>
                    Primitives.point(junction.x, junction.y)
                ),
                edges
            })
        }

        return consumedSegmentKeys
    }

    /**
     * Returns a stable segment key.
     * @param {Record<string, unknown>} segment Segment row.
     * @returns {string}
     */
    static segmentKey(segment) {
        const start = [
            Primitives.number(segment.x1, 0),
            Primitives.number(segment.y1, 0)
        ]
        const end = [
            Primitives.number(segment.x2, 0),
            Primitives.number(segment.y2, 0)
        ]
        const ordered =
            start.join(':') <= end.join(':') ? [start, end] : [end, start]

        return ordered.flat().join(':')
    }

    /**
     * Returns stable pin lookup keys.
     * @param {Record<string, unknown>} pin Pin row.
     * @returns {string[]}
     */
    static pinKeys(pin) {
        const owners = [
            pin.ownerIndex,
            pin.ownerDesignator,
            pin.owner,
            pin.component,
            pin.componentDesignator
        ]
            .map((value) => String(value ?? '').trim())
            .filter(Boolean)
        const pins = [pin.pinNumber, pin.designator, pin.number, pin.name]
            .map((value) => String(value ?? '').trim())
            .filter(Boolean)

        return owners.flatMap((owner) =>
            pins.map((pinNumber) => `${owner}:${pinNumber}`)
        )
    }

    /**
     * Returns or creates a source net id.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {string} idScope Deterministic id scope.
     * @param {Map<string, string>} sourceNetIds Source net ids by name.
     * @param {string} netName Net name.
     * @returns {string}
     */
    static #sourceNetId(circuitJson, idScope, sourceNetIds, netName) {
        if (!sourceNetIds.has(netName)) {
            sourceNetIds.set(netName, Primitives.sourceNetId(idScope, netName))
        }

        const sourceNetId = sourceNetIds.get(netName)
        Elements.appendMissingSourceNet(circuitJson, sourceNetId, netName)
        return sourceNetId
    }

    /**
     * Returns connected source port ids for one parsed net.
     * @param {Record<string, unknown>} net Net row.
     * @param {Map<object, string>} sourcePortIds Source port ids by pin object.
     * @param {Map<string, string>} sourcePortIdsByKey Source port ids by stable pin key.
     * @returns {string[]}
     */
    static #connectedSourcePortIds(net, sourcePortIds, sourcePortIdsByKey) {
        const ids = []
        for (const pin of [
            ...Primitives.array(net.pins),
            ...Primitives.array(net.ports)
        ]) {
            const direct = sourcePortIds.get(pin)
            if (direct) {
                ids.push(direct)
                continue
            }

            const keyed = CircuitJsonSchematicTraceBuilder.pinKeys(pin)
                .map((key) => sourcePortIdsByKey.get(key))
                .find(Boolean)
            if (keyed) ids.push(keyed)
        }

        return [...new Set(ids)]
    }
}
