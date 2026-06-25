// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

const ZONE_TYPES = [
    'pcb_copper_pour',
    'pcb_ground_plane',
    'pcb_ground_plane_region'
]
const KEEPOUT_TYPES = ['pcb_keepout']
const KEEPOUT_TARGETS = ['tracks', 'vias', 'pads', 'copperpour', 'footprints']

/**
 * Builds KiCad PCB copper zone nodes from CircuitJSON zone-like rows.
 */
export class CircuitJsonKicadProjectPcbZoneBuilder {
    /**
     * Builds all copper zone nodes.
     * @param {object} context Export context.
     * @param {{ netName: Function, copperLayer: Function }} options Builder hooks.
     * @returns {Array[]}
     */
    static nodes(context, options) {
        return ZONE_TYPES.flatMap((type) =>
            context.elements
                .filter((element) => element?.type === type)
                .map((element, index) =>
                    CircuitJsonKicadProjectPcbZoneBuilder.node(
                        context,
                        element,
                        index,
                        options
                    )
                )
                .filter(Boolean)
        )
    }

    /**
     * Builds all PCB keepout zone nodes.
     * @param {object} context Export context.
     * @param {{ copperLayer: Function }} options Builder hooks.
     * @returns {Array[]}
     */
    static keepoutNodes(context, options) {
        return KEEPOUT_TYPES.flatMap((type) =>
            context.elements
                .filter((element) => element?.type === type)
                .map((element, index) =>
                    CircuitJsonKicadProjectPcbZoneBuilder.keepoutNode(
                        element,
                        index,
                        options
                    )
                )
                .filter(Boolean)
        )
    }

    /**
     * Builds one copper zone node.
     * @param {object} context Export context.
     * @param {object} element Zone-like element.
     * @param {number} index Zone index.
     * @param {{ netName: Function, copperLayer: Function }} options Builder hooks.
     * @returns {Array | null}
     */
    static node(context, element, index, options) {
        const rings = CircuitJsonKicadProjectPcbZoneBuilder.rings(element)
        if (!rings.outer.length) return null
        const netName = options.netName(context, element)
        const netId = netName ? context.netMap.get(netName) || 0 : 0
        const layer = options.copperLayer(element.layer)

        return [
            'zone',
            ['net', netId],
            ['net_name', netName],
            ['layer', layer],
            [
                'uuid',
                Utils.uuid('zone:' + (element.pcb_copper_pour_id || index))
            ],
            ['hatch', 'edge', Utils.number(element.hatch_pitch, 0.5)],
            [
                'connect_pads',
                [
                    'clearance',
                    Utils.number(
                        element.clearance ??
                            element.pad_clearance ??
                            element.padClearance,
                        0.2
                    )
                ]
            ],
            [
                'min_thickness',
                Utils.number(element.min_thickness ?? element.minThickness, 0.2)
            ],
            ['fill', 'yes', ['island_removal_mode', 0]],
            ...[rings.outer, ...rings.inner].map((ring) => [
                'polygon',
                CircuitJsonKicadProjectPcbZoneBuilder.pointsNode(ring)
            ]),
            [
                'filled_polygon',
                ['layer', layer],
                ...[rings.outer, ...rings.inner].map((ring) =>
                    CircuitJsonKicadProjectPcbZoneBuilder.pointsNode(ring)
                )
            ]
        ]
    }

    /**
     * Builds one PCB keepout zone node.
     * @param {object} element Keepout element.
     * @param {number} index Keepout index.
     * @param {{ copperLayer: Function }} options Builder hooks.
     * @returns {Array | null}
     */
    static keepoutNode(element, index, options) {
        const rings = CircuitJsonKicadProjectPcbZoneBuilder.rings(element)
        if (!rings.outer.length) return null
        const id = CircuitJsonKicadProjectPcbZoneBuilder.keepoutId(
            element,
            index
        )
        const layer = options.copperLayer(
            CircuitJsonKicadProjectPcbZoneBuilder.keepoutLayer(element)
        )

        return [
            'zone',
            ['net', 0],
            ['net_name', ''],
            ['layer', layer],
            ['uuid', Utils.uuid('keepout:' + id)],
            ...CircuitJsonKicadProjectPcbZoneBuilder.keepoutNameNode(element),
            ['hatch', 'edge', Utils.number(element.hatch_pitch, 0.5)],
            [
                'connect_pads',
                [
                    'clearance',
                    Utils.number(
                        element.clearance ??
                            element.pad_clearance ??
                            element.padClearance,
                        0.2
                    )
                ]
            ],
            [
                'min_thickness',
                Utils.number(element.min_thickness ?? element.minThickness, 0.2)
            ],
            [
                'keepout',
                ...CircuitJsonKicadProjectPcbZoneBuilder.keepoutTargets(
                    element
                ).map((target) => [target, 'not_allowed'])
            ],
            ...[rings.outer, ...rings.inner].map((ring) => [
                'polygon',
                CircuitJsonKicadProjectPcbZoneBuilder.pointsNode(ring)
            ])
        ]
    }

    /**
     * Resolves copper zone outer and inner rings.
     * @param {object} element Zone-like element.
     * @returns {{ outer: { x: number, y: number }[], inner: { x: number, y: number }[][] }}
     */
    static rings(element) {
        const shape = Utils.text(element.shape).toLowerCase()
        if (shape === 'brep') {
            return CircuitJsonKicadProjectPcbZoneBuilder.brepRings(element)
        }
        if (shape === 'rect' || shape === 'rectangle') {
            return {
                outer: CircuitJsonKicadProjectPcbZoneBuilder.rectRing(element),
                inner: []
            }
        }
        return {
            outer: CircuitJsonKicadProjectPcbZoneBuilder.cleanRing(
                CircuitJsonKicadProjectPcbZoneBuilder.pointList(
                    element.points || element.outline || element.vertices
                )
            ),
            inner: []
        }
    }

    /**
     * Resolves the source layer for a keepout.
     * @param {object} element Keepout element.
     * @returns {string}
     */
    static keepoutLayer(element) {
        if (Array.isArray(element.layers) && element.layers.length) {
            return Utils.text(element.layers[0], 'top')
        }
        return Utils.text(element.layer || element.side, 'top')
    }

    /**
     * Builds an optional keepout name node.
     * @param {object} element Keepout element.
     * @returns {Array[]}
     */
    static keepoutNameNode(element) {
        const name = Utils.text(element.name || element.display_name)
        return name ? [['name', name]] : []
    }

    /**
     * Resolves enabled keepout target names.
     * @param {object} element Keepout element.
     * @returns {string[]}
     */
    static keepoutTargets(element) {
        const overrides =
            element.keepout_targets || element.keepoutTargets || {}
        return KEEPOUT_TARGETS.filter((target) => {
            const value =
                overrides[target] ??
                element['keepout_' + target] ??
                element[target]
            return value === undefined
                ? true
                : value === true || Utils.text(value).toLowerCase() === 'yes'
        })
    }

    /**
     * Resolves a stable keepout identifier.
     * @param {object} element Keepout element.
     * @param {number} index Keepout index.
     * @returns {string}
     */
    static keepoutId(element, index) {
        return (
            Utils.text(element.pcb_keepout_id || element.id || element.name) ||
            'keepout_' + (index + 1)
        )
    }

    /**
     * Resolves B-Rep zone rings.
     * @param {object} element Zone-like element.
     * @returns {{ outer: { x: number, y: number }[], inner: { x: number, y: number }[][] }}
     */
    static brepRings(element) {
        const shape =
            element.brep_shape ||
            (Array.isArray(element.brep_shapes)
                ? element.brep_shapes[0]
                : null) ||
            (Array.isArray(element.brep_shape_array)
                ? element.brep_shape_array[0]
                : null) ||
            {}
        const outerSource = shape.outer_ring || shape.outerRing || {}
        const innerSources = shape.inner_rings || shape.innerRings || []
        return {
            outer: CircuitJsonKicadProjectPcbZoneBuilder.cleanRing(
                CircuitJsonKicadProjectPcbZoneBuilder.pointList(
                    outerSource.vertices || outerSource
                )
            ),
            inner: (Array.isArray(innerSources) ? innerSources : [])
                .map((ring) =>
                    CircuitJsonKicadProjectPcbZoneBuilder.cleanRing(
                        CircuitJsonKicadProjectPcbZoneBuilder.pointList(
                            ring.vertices || ring
                        )
                    )
                )
                .filter((ring) => ring.length >= 3)
        }
    }

    /**
     * Builds rectangle ring points with optional rotation.
     * @param {object} element Zone-like element.
     * @returns {{ x: number, y: number }[]}
     */
    static rectRing(element) {
        const center = Utils.point(element.center || element) || { x: 0, y: 0 }
        const halfWidth = Utils.number(element.width, 0) / 2
        const halfHeight = Utils.number(element.height, 0) / 2
        if (halfWidth <= 0 || halfHeight <= 0) return []
        const radians = (Utils.number(element.rotation, 0) * Math.PI) / 180
        const cos = Math.cos(radians)
        const sin = Math.sin(radians)
        const corners = [
            { x: -halfWidth, y: -halfHeight },
            { x: halfWidth, y: -halfHeight },
            { x: halfWidth, y: halfHeight },
            { x: -halfWidth, y: halfHeight }
        ].map((corner) => ({
            x: Utils.round(center.x + corner.x * cos - corner.y * sin),
            y: Utils.round(center.y + corner.x * sin + corner.y * cos)
        }))
        return CircuitJsonKicadProjectPcbZoneBuilder.cleanRing(corners)
    }

    /**
     * Builds a KiCad points node from a source ring.
     * @param {{ x: number, y: number }[]} ring Source ring.
     * @returns {Array}
     */
    static pointsNode(ring) {
        return [
            'pts',
            ...ring.map((point) => ['xy', point.x, Utils.round(-point.y)])
        ]
    }

    /**
     * Converts a candidate point list into normalized points.
     * @param {unknown} value Candidate points.
     * @returns {{ x: number, y: number }[]}
     */
    static pointList(value) {
        return (Array.isArray(value) ? value : [])
            .map((point) => Utils.point(point))
            .filter(Boolean)
    }

    /**
     * Removes duplicate and closing points from a ring.
     * @param {{ x: number, y: number }[]} points Source points.
     * @returns {{ x: number, y: number }[]}
     */
    static cleanRing(points) {
        const ring = []
        for (const point of points) {
            const previous = ring.at(-1)
            if (previous?.x === point.x && previous.y === point.y) continue
            ring.push(point)
        }
        const first = ring[0]
        const last = ring.at(-1)
        if (
            first &&
            last &&
            ring.length > 1 &&
            first.x === last.x &&
            first.y === last.y
        ) {
            ring.pop()
        }
        return ring.length >= 3 ? ring : []
    }
}
