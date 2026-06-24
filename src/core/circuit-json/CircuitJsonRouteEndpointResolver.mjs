// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Resolves Circuit JSON route endpoints against known PCB port placements.
 */
export class CircuitJsonRouteEndpointResolver {
    /**
     * Finds a PCB port placement for one routed trace endpoint.
     * @param {object[]} portPlacements Port placements.
     * @param {{ x: number, y: number }} point Endpoint.
     * @param {string} layer Trace layer.
     * @param {string | undefined} sourceNetId Source net id.
     * @returns {object | undefined}
     */
    static findPort(portPlacements, point, layer, sourceNetId) {
        return portPlacements.find((placement) => {
            if (
                sourceNetId &&
                placement.sourceNetId &&
                placement.sourceNetId !== sourceNetId
            ) {
                return false
            }
            if (
                Array.isArray(placement.layers) &&
                placement.layers.length &&
                !placement.layers.includes(layer)
            ) {
                return false
            }

            return CircuitJsonRouteEndpointResolver.#pointsMatch(
                placement.center,
                point
            )
        })
    }

    /**
     * Returns unique source port ids from optional port placements.
     * @param {(object | undefined)[]} portPlacements Port placements.
     * @returns {string[]}
     */
    static sourcePortIds(portPlacements) {
        return [
            ...new Set(
                portPlacements
                    .map((placement) => placement?.sourcePortId)
                    .filter(Boolean)
            )
        ]
    }

    /**
     * Returns true when two Circuit JSON points describe the same endpoint.
     * @param {{ x: number, y: number }} first First point.
     * @param {{ x: number, y: number }} second Second point.
     * @returns {boolean}
     */
    static #pointsMatch(first, second) {
        return (
            Math.abs(Number(first?.x || 0) - Number(second?.x || 0)) < 1e-6 &&
            Math.abs(Number(first?.y || 0) - Number(second?.y || 0)) < 1e-6
        )
    }
}
