// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Marks visible schematic pins that KiCad renders with dangling endpoint rings.
 */
export class KicadSchematicDanglingEndpointMarker {
    /**
     * Adds dangling endpoint visibility flags to parsed pin rows.
     * @param {object[]} pins Parsed schematic pins.
     * @param {{ nets?: object[], crosses?: object[], texts?: object[] }} context Schematic connectivity context.
     * @returns {void}
     */
    static markPins(pins, context = {}) {
        for (const pin of pins || []) {
            pin.danglingEndpointVisible =
                KicadSchematicDanglingEndpointMarker.#isDanglingEndpointPin(
                    pin,
                    context
                )
        }
    }

    /**
     * Checks whether one parsed pin should show KiCad's dangling endpoint ring.
     * @param {object} pin Parsed symbol pin.
     * @param {{ nets?: object[], crosses?: object[], texts?: object[] }} context Schematic connectivity context.
     * @returns {boolean}
     */
    static #isDanglingEndpointPin(pin, context) {
        return (
            pin.visible !== false &&
            pin.symbolKind !== 'power' &&
            String(pin.electricalType || '') !== 'no_connect' &&
            !KicadSchematicDanglingEndpointMarker.#pinBelongsToNet(
                pin,
                context.nets || []
            ) &&
            !KicadSchematicDanglingEndpointMarker.#pinHasNoConnectMarker(
                pin,
                context.crosses || []
            ) &&
            !KicadSchematicDanglingEndpointMarker.#pinTouchesNetLabel(
                pin,
                context.texts || []
            )
        )
    }

    /**
     * Checks whether one pin is already part of a parsed net.
     * @param {object} pin Parsed symbol pin.
     * @param {object[]} nets Parsed schematic nets.
     * @returns {boolean}
     */
    static #pinBelongsToNet(pin, nets) {
        return nets.some((net) => {
            return [...(net.pins || []), ...(net.powerPorts || [])].some(
                (netPin) =>
                    KicadSchematicDanglingEndpointMarker.#samePin(pin, netPin)
            )
        })
    }

    /**
     * Checks whether two pin rows identify the same placed symbol pin.
     * @param {object} left First pin.
     * @param {object} right Second pin.
     * @returns {boolean}
     */
    static #samePin(left, right) {
        if (left === right) return true
        const leftOwner = String(left?.ownerIndex || '')
        const rightOwner = String(right?.ownerIndex || '')
        const leftDesignator = String(left?.designator || '')
        const rightDesignator = String(right?.designator || '')
        return (
            Boolean(leftOwner) &&
            Boolean(leftDesignator) &&
            leftOwner === rightOwner &&
            leftDesignator === rightDesignator
        )
    }

    /**
     * Checks whether one pin has an explicit or synthesized no-connect marker.
     * @param {object} pin Parsed symbol pin.
     * @param {object[]} crosses Parsed no-connect markers.
     * @returns {boolean}
     */
    static #pinHasNoConnectMarker(pin, crosses) {
        const point =
            KicadSchematicDanglingEndpointMarker.#pinConnectionPoint(pin)
        return crosses.some((cross) =>
            KicadSchematicDanglingEndpointMarker.#pointsEqual(point, cross)
        )
    }

    /**
     * Checks whether a KiCad net label directly names one pin endpoint.
     * @param {object} pin Parsed symbol pin.
     * @param {object[]} texts Parsed schematic texts.
     * @returns {boolean}
     */
    static #pinTouchesNetLabel(pin, texts) {
        const point =
            KicadSchematicDanglingEndpointMarker.#pinConnectionPoint(pin)
        return texts
            .filter((text) => text.recordType === '25')
            .some((text) =>
                KicadSchematicDanglingEndpointMarker.#pointsEqual(point, text)
            )
    }

    /**
     * Resolves the external connection point for a parsed schematic pin.
     * @param {object} pin Parsed pin.
     * @returns {{ x: number, y: number }}
     */
    static #pinConnectionPoint(pin) {
        const x = KicadSchematicDanglingEndpointMarker.#numberValue(pin.x, 0)
        const y = KicadSchematicDanglingEndpointMarker.#numberValue(pin.y, 0)
        const length = KicadSchematicDanglingEndpointMarker.#numberValue(
            pin.length,
            0
        )
        if (pin.orientation === 'left') return { x: x - length, y }
        if (pin.orientation === 'right') return { x: x + length, y }
        if (pin.orientation === 'top') return { x, y: y - length }
        return { x, y: y + length }
    }

    /**
     * Checks coordinate equality with KiCad schematic tolerance.
     * @param {{ x?: number, y?: number }} left First point.
     * @param {{ x?: number, y?: number }} right Second point.
     * @returns {boolean}
     */
    static #pointsEqual(left, right) {
        return (
            Math.abs(
                KicadSchematicDanglingEndpointMarker.#numberValue(left?.x, 0) -
                    KicadSchematicDanglingEndpointMarker.#numberValue(
                        right?.x,
                        0
                    )
            ) < 0.01 &&
            Math.abs(
                KicadSchematicDanglingEndpointMarker.#numberValue(left?.y, 0) -
                    KicadSchematicDanglingEndpointMarker.#numberValue(
                        right?.y,
                        0
                    )
            ) < 0.01
        )
    }

    /**
     * Reads a finite number with fallback.
     * @param {unknown} value Value.
     * @param {number} fallback Fallback.
     * @returns {number}
     */
    static #numberValue(value, fallback) {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : fallback
    }
}
