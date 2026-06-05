// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonModelAdapterPrimitives } from './CircuitJsonModelAdapterPrimitives.mjs'

const Primitives = CircuitJsonModelAdapterPrimitives

/**
 * Appends schema-shaped Circuit JSON helper elements.
 */
export class CircuitJsonModelAdapterElements {
    /**
     * Appends one PCB hole or plated hole.
     * @param {object[]} circuitJson
     * @param {string} idScope
     * @param {Record<string, unknown>} pad
     * @param {number} padIndex
     * @param {Record<string, unknown>} placement
     * @returns {void}
     */
    static appendPcbHole(circuitJson, idScope, pad, padIndex, placement) {
        const center = placement.center
        const holeDiameter = Primitives.milNumber(pad.holeDiameter, 0)

        if (pad.isPlated === false) {
            circuitJson.push({
                type: 'pcb_hole',
                pcb_hole_id: Primitives.id(idScope, ['pcb_hole', padIndex]),
                pcb_component_id: placement.pcbComponentId,
                hole_shape: 'circle',
                hole_diameter: holeDiameter,
                x: center.x,
                y: center.y
            })
            return
        }

        circuitJson.push({
            type: 'pcb_plated_hole',
            pcb_plated_hole_id: Primitives.id(idScope, [
                'pcb_plated_hole',
                padIndex
            ]),
            pcb_component_id: placement.pcbComponentId,
            pcb_port_id: placement.pcbPortId,
            port_hints: [placement.portHint],
            shape: 'circle',
            outer_diameter: Primitives.milNumber(
                pad.sizeTopX || pad.sizeX || pad.diameter,
                0
            ),
            hole_diameter: holeDiameter,
            x: center.x,
            y: center.y,
            layers: placement.layers
        })
    }

    /**
     * Returns a source net id for one primitive and appends missing net records.
     * @param {object[]} circuitJson
     * @param {string} idScope
     * @param {Record<string, unknown>} primitive
     * @param {Map<string, string>} sourceNetIds
     * @returns {string | undefined}
     */
    static sourceNetIdForPrimitive(
        circuitJson,
        idScope,
        primitive,
        sourceNetIds
    ) {
        const key = String(
            primitive.netName || primitive.net || primitive.netIndex || ''
        ).trim()
        if (!key) return undefined

        if (!sourceNetIds.has(key)) {
            sourceNetIds.set(key, Primitives.sourceNetId(idScope, key))
        }

        const sourceNetId = sourceNetIds.get(key)
        CircuitJsonModelAdapterElements.appendMissingSourceNet(
            circuitJson,
            sourceNetId,
            key
        )

        return sourceNetId
    }

    /**
     * Appends a source net unless it already exists.
     * @param {object[]} circuitJson
     * @param {string} sourceNetId
     * @param {string} name
     * @returns {void}
     */
    static appendMissingSourceNet(circuitJson, sourceNetId, name) {
        if (
            circuitJson.some(
                (element) =>
                    element.type === 'source_net' &&
                    element.source_net_id === sourceNetId
            )
        ) {
            return
        }

        circuitJson.push({
            type: 'source_net',
            source_net_id: sourceNetId,
            name: Primitives.string(name, 'NET'),
            member_source_group_ids: []
        })
    }
}
