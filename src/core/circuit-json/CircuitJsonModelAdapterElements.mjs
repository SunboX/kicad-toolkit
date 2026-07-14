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
        const drill = CircuitJsonModelAdapterElements.#drillGeometry(pad)
        const portHints = placement.portHints || [placement.portHint]

        if (pad.isPlated === false) {
            const pcbHole = {
                type: 'pcb_hole',
                pcb_hole_id: Primitives.id(idScope, ['pcb_hole', padIndex]),
                pcb_component_id: placement.pcbComponentId,
                x: Primitives.round(center.x + drill.offset.x),
                y: Primitives.round(center.y + drill.offset.y)
            }
            CircuitJsonModelAdapterElements.#assignDrillFields(pcbHole, drill)
            circuitJson.push(pcbHole)
            return
        }

        const platedHole = {
            type: 'pcb_plated_hole',
            pcb_plated_hole_id: Primitives.id(idScope, [
                'pcb_plated_hole',
                padIndex
            ]),
            pcb_component_id: placement.pcbComponentId,
            pcb_port_id: placement.pcbPortId,
            port_hints: portHints,
            x: center.x,
            y: center.y,
            layers: placement.layers
        }
        const padShape = Primitives.padShape(pad)
        if (padShape === 'polygon') {
            CircuitJsonModelAdapterElements.#assignPolygonPadFields(
                platedHole,
                pad,
                drill
            )
        } else if (
            padShape !== 'circle' ||
            drill.shape !== 'circle' ||
            drill.offset.x !== 0 ||
            drill.offset.y !== 0
        ) {
            const width = Primitives.milNumber(
                pad.sizeTopX || pad.sizeX || pad.width,
                0
            )
            const height = Primitives.milNumber(
                pad.sizeTopY || pad.sizeY || pad.height,
                width
            )
            const rotation = Primitives.normalizedRotation(pad.rotation)
            const borderRadius =
                padShape === 'pill' || padShape === 'circle'
                    ? Math.min(width, height) / 2
                    : Primitives.padCornerRadius(pad, width, height)
            const rectPad = {
                pad_shape: 'rect',
                rect_pad_width: width,
                rect_pad_height: height,
                rect_border_radius: Primitives.round(borderRadius)
            }
            if (drill.shape === 'circle') {
                Object.assign(platedHole, rectPad, {
                    shape: 'circular_hole_with_rect_pad',
                    hole_shape: 'circle',
                    hole_diameter: drill.diameter,
                    rect_ccw_rotation: rotation
                })
            } else if (rotation === 0 && drill.rotation === 0) {
                Object.assign(platedHole, rectPad, {
                    shape: 'pill_hole_with_rect_pad',
                    hole_shape: 'pill',
                    hole_width: drill.width,
                    hole_height: drill.height
                })
            } else {
                Object.assign(platedHole, rectPad, {
                    shape: 'rotated_pill_hole_with_rect_pad',
                    hole_shape: 'rotated_pill',
                    hole_width: drill.width,
                    hole_height: drill.height,
                    hole_ccw_rotation: drill.rotation,
                    rect_ccw_rotation: rotation
                })
            }
            CircuitJsonModelAdapterElements.#assignDrillOffset(
                platedHole,
                drill.offset
            )
        } else {
            Object.assign(platedHole, {
                shape: 'circle',
                outer_diameter: Primitives.milNumber(
                    pad.sizeTopX || pad.sizeX || pad.diameter,
                    0
                ),
                hole_diameter: drill.diameter
            })
        }
        circuitJson.push(platedHole)
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

        const rawName = Primitives.string(name, 'NET')
        const netName = CircuitJsonModelAdapterElements.#uniqueSourceNetName(
            circuitJson,
            rawName
        )
        const sourceNet = {
            type: 'source_net',
            source_net_id: sourceNetId,
            name: netName,
            member_source_group_ids: []
        }

        if (rawName !== netName) sourceNet.raw_name = rawName
        circuitJson.push(sourceNet)
    }

    /**
     * Resolves canonical circular or slotted drill geometry.
     * @param {Record<string, unknown>} pad Renderer-model pad.
     * @returns {{ shape: 'circle' | 'pill', diameter: number, width: number, height: number, rotation: number, offset: { x: number, y: number } }}
     */
    static #drillGeometry(pad) {
        const diameter = Primitives.milNumber(pad.holeDiameter, 0)
        const slotLength = Primitives.milNumber(
            pad.holeSlotLength || pad.slotLength,
            0
        )
        const shape = String(
            pad.drillShape || pad.kicadPad?.drillShape || pad.holeShape || ''
        ).toLowerCase()
        const isSlot =
            shape.includes('oval') ||
            shape.includes('pill') ||
            shape.includes('slot') ||
            slotLength > diameter
        const rawDrillWidth = Primitives.number(pad.drillWidth, 0) || 0
        const rawDrillHeight = Primitives.number(pad.drillHeight, 0) || 0
        const explicitRotation = Primitives.number(pad.holeRotation, null)
        const relativeRotation =
            explicitRotation ??
            (rawDrillHeight > rawDrillWidth && rawDrillWidth > 0 ? 90 : 0)
        const padRotation = Primitives.number(pad.rotation, 0) || 0

        return {
            shape: isSlot ? 'pill' : 'circle',
            diameter,
            width: Math.max(slotLength, diameter),
            height: diameter,
            rotation: Primitives.normalizedRotation(
                padRotation + relativeRotation
            ),
            offset: CircuitJsonModelAdapterElements.#drillOffset(
                pad,
                padRotation
            )
        }
    }

    /**
     * Assigns canonical polygon-pad and drill geometry fields.
     * @param {Record<string, unknown>} platedHole CircuitJSON plated-hole row.
     * @param {Record<string, unknown>} pad Renderer-model pad.
     * @param {{ shape: 'circle' | 'pill', diameter: number, width: number, height: number, rotation: number, offset: { x: number, y: number } }} drill Drill geometry.
     * @returns {void}
     */
    static #assignPolygonPadFields(platedHole, pad, drill) {
        Object.assign(platedHole, {
            shape: 'hole_with_polygon_pad',
            pad_outline: Primitives.customPadPoints(pad),
            hole_shape:
                drill.shape === 'circle'
                    ? 'circle'
                    : drill.rotation === 0
                      ? 'pill'
                      : 'rotated_pill'
        })
        if (drill.shape === 'circle') {
            platedHole.hole_diameter = drill.diameter
        } else {
            platedHole.hole_width = drill.width
            platedHole.hole_height = drill.height
            if (drill.rotation !== 0) platedHole.ccw_rotation = drill.rotation
        }
        CircuitJsonModelAdapterElements.#assignDrillOffset(
            platedHole,
            drill.offset
        )
    }

    /**
     * Resolves a pad-local millimeter drill offset in board coordinates.
     * @param {Record<string, unknown>} pad Renderer-model pad.
     * @param {number} padRotation Board-space pad rotation in degrees.
     * @returns {{ x: number, y: number }} Board-space millimeter offset.
     */
    static #drillOffset(pad, padRotation) {
        const offset = pad.drillOffset || pad.kicadPad?.drillOffset
        const localX = Primitives.number(offset?.x, 0) || 0
        const localY = Primitives.number(offset?.y, 0) || 0
        if (localX === 0 && localY === 0) return { x: 0, y: 0 }

        const radians = (padRotation * Math.PI) / 180
        return {
            x: Primitives.round(
                localX * Math.cos(radians) - localY * Math.sin(radians)
            ),
            y: Primitives.round(
                localX * Math.sin(radians) + localY * Math.cos(radians)
            )
        }
    }

    /**
     * Assigns non-zero board-space drill offsets to a plated-hole row.
     * @param {Record<string, unknown>} platedHole CircuitJSON plated-hole row.
     * @param {{ x: number, y: number }} offset Board-space millimeter offset.
     * @returns {void}
     */
    static #assignDrillOffset(platedHole, offset) {
        if (offset.x !== 0) platedHole.hole_offset_x = offset.x
        if (offset.y !== 0) platedHole.hole_offset_y = offset.y
    }

    /**
     * Assigns canonical drill fields to one non-plated hole row.
     * @param {Record<string, unknown>} pcbHole CircuitJSON hole row.
     * @param {{ shape: 'circle' | 'pill', diameter: number, width: number, height: number, rotation: number, offset: { x: number, y: number } }} drill Drill geometry.
     * @returns {void}
     */
    static #assignDrillFields(pcbHole, drill) {
        if (drill.shape === 'circle') {
            Object.assign(pcbHole, {
                hole_shape: 'circle',
                hole_diameter: drill.diameter
            })
            return
        }

        Object.assign(pcbHole, {
            hole_shape: drill.rotation === 0 ? 'pill' : 'rotated_pill',
            hole_width: drill.width,
            hole_height: drill.height
        })
        if (drill.rotation !== 0) pcbHole.ccw_rotation = drill.rotation
    }

    /**
     * Returns a source-net name that does not collide with existing names.
     * @param {object[]} circuitJson Circuit JSON elements.
     * @param {string} rawName Raw source net label.
     * @returns {string}
     */
    static #uniqueSourceNetName(circuitJson, rawName) {
        const baseName = Primitives.sourceNetName(rawName, 'NET')
        const existingNames = new Set(
            circuitJson
                .filter((element) => element.type === 'source_net')
                .map((element) => String(element.name || '').trim())
                .filter(Boolean)
        )

        if (!existingNames.has(baseName)) return baseName
        for (let suffix = 2; ; suffix += 1) {
            const candidate = `${baseName}_${suffix}`
            if (!existingNames.has(candidate)) return candidate
        }
    }
}
