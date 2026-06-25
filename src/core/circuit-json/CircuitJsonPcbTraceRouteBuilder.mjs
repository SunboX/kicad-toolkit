// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonModelAdapterElements } from './CircuitJsonModelAdapterElements.mjs'
import { CircuitJsonModelAdapterPrimitives } from './CircuitJsonModelAdapterPrimitives.mjs'
import { CircuitJsonRouteEndpointResolver } from './CircuitJsonRouteEndpointResolver.mjs'

const Elements = CircuitJsonModelAdapterElements
const Primitives = CircuitJsonModelAdapterPrimitives
const endpointTolerance = 1e-6

/**
 * Builds connected Circuit JSON PCB trace routes from renderer primitives.
 */
export class CircuitJsonPcbTraceRouteBuilder {
    /**
     * Appends PCB traces from connected track, arc, and via primitives.
     * @param {object[]} circuitJson Circuit JSON elements.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} pcb Renderer PCB model.
     * @param {Map<string, string>} sourceNetIds Known source net ids.
     * @param {object[]} portPlacements Known PCB port placements.
     * @returns {void}
     */
    static append(circuitJson, idScope, pcb, sourceNetIds, portPlacements) {
        const edges = [
            ...Primitives.array(pcb.tracks).map((track, index) =>
                CircuitJsonPcbTraceRouteBuilder.#trackEdge(
                    circuitJson,
                    idScope,
                    track,
                    index,
                    sourceNetIds
                )
            ),
            ...Primitives.array(pcb.arcs).map((arc, index) =>
                CircuitJsonPcbTraceRouteBuilder.#arcEdge(
                    circuitJson,
                    idScope,
                    arc,
                    index,
                    sourceNetIds
                )
            ),
            ...Primitives.array(pcb.vias).map((via, index) =>
                CircuitJsonPcbTraceRouteBuilder.#viaEdge(
                    circuitJson,
                    idScope,
                    via,
                    index,
                    sourceNetIds
                )
            )
        ].filter(Boolean)
        let traceIndex = 0

        for (const groupEdges of CircuitJsonPcbTraceRouteBuilder.#edgeGroups(
            edges
        ).values()) {
            traceIndex = CircuitJsonPcbTraceRouteBuilder.#appendGroup(
                circuitJson,
                idScope,
                groupEdges,
                traceIndex,
                portPlacements
            )
        }
    }

    /**
     * Builds a graph edge for one straight track.
     * @param {object[]} circuitJson Circuit JSON elements.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} track Track primitive.
     * @param {number} index Track index.
     * @param {Map<string, string>} sourceNetIds Known source net ids.
     * @returns {object | null}
     */
    static #trackEdge(circuitJson, idScope, track, index, sourceNetIds) {
        const layer = Primitives.layerName(track)
        const start = Primitives.milPoint(track.x1, track.y1)
        const end = Primitives.milPoint(track.x2, track.y2)
        if (CircuitJsonPcbTraceRouteBuilder.#pointsMatch(start, end)) {
            return null
        }

        return CircuitJsonPcbTraceRouteBuilder.#wireEdge({
            id: `track:${index}`,
            index,
            kind: 'wire',
            primitive: track,
            layer,
            points: [start, end],
            width: Primitives.milNumber(track.width, 0),
            sourceNetId: Elements.sourceNetIdForPrimitive(
                circuitJson,
                idScope,
                track,
                sourceNetIds
            )
        })
    }

    /**
     * Builds a graph edge for one routed copper arc.
     * @param {object[]} circuitJson Circuit JSON elements.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} arc Arc primitive.
     * @param {number} index Arc index.
     * @param {Map<string, string>} sourceNetIds Known source net ids.
     * @returns {object | null}
     */
    static #arcEdge(circuitJson, idScope, arc, index, sourceNetIds) {
        const center = Primitives.milPoint(arc.x, arc.y)
        const radius = Primitives.milNumber(arc.radius, 0)
        if (radius <= 0) return null

        const points = CircuitJsonPcbTraceRouteBuilder.#arcPoints(
            center,
            radius,
            Primitives.number(arc.startAngle, 0) || 0,
            CircuitJsonPcbTraceRouteBuilder.#arcSweepAngle(arc)
        )
        if (points.length < 2) return null

        return CircuitJsonPcbTraceRouteBuilder.#wireEdge({
            id: `arc:${index}`,
            index,
            kind: 'arc',
            primitive: arc,
            layer: Primitives.layerName(arc),
            points,
            width: Primitives.milNumber(arc.width, 0),
            sourceNetId: Elements.sourceNetIdForPrimitive(
                circuitJson,
                idScope,
                arc,
                sourceNetIds
            )
        })
    }

    /**
     * Builds a graph edge for one via layer transition.
     * @param {object[]} circuitJson Circuit JSON elements.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} via Via primitive.
     * @param {number} index Via index.
     * @param {Map<string, string>} sourceNetIds Known source net ids.
     * @returns {object | null}
     */
    static #viaEdge(circuitJson, idScope, via, index, sourceNetIds) {
        const layers = Primitives.copperLayers(via)
        if (layers.length < 2) return null

        const point = Primitives.milPoint(via.x, via.y)
        const fromLayer = layers[0]
        const toLayer = layers[layers.length - 1]
        const sourceNetId = Elements.sourceNetIdForPrimitive(
            circuitJson,
            idScope,
            via,
            sourceNetIds
        )

        return {
            id: `via:${index}`,
            index,
            kind: 'via',
            primitive: via,
            point,
            start: point,
            end: point,
            startLayer: fromLayer,
            endLayer: toLayer,
            startKey: CircuitJsonPcbTraceRouteBuilder.#nodeKey(
                point,
                fromLayer
            ),
            endKey: CircuitJsonPcbTraceRouteBuilder.#nodeKey(point, toLayer),
            sourceNetId,
            groupKey:
                sourceNetId ||
                CircuitJsonPcbTraceRouteBuilder.#primitiveNetKey(via) ||
                `via:${index}`,
            outerDiameter: Primitives.milNumber(via.diameter, 0),
            holeDiameter: Primitives.milNumber(via.holeDiameter, 0)
        }
    }

    /**
     * Adds graph endpoint fields to one wire edge.
     * @param {object} edge Wire edge fields.
     * @returns {object}
     */
    static #wireEdge(edge) {
        const start = edge.points[0]
        const end = edge.points[edge.points.length - 1]

        return {
            ...edge,
            start,
            end,
            startLayer: edge.layer,
            endLayer: edge.layer,
            startKey: CircuitJsonPcbTraceRouteBuilder.#nodeKey(
                start,
                edge.layer
            ),
            endKey: CircuitJsonPcbTraceRouteBuilder.#nodeKey(end, edge.layer),
            groupKey:
                edge.sourceNetId ||
                CircuitJsonPcbTraceRouteBuilder.#primitiveNetKey(
                    edge.primitive
                ) ||
                edge.id
        }
    }

    /**
     * Groups edges by net identity.
     * @param {object[]} edges Graph edges.
     * @returns {Map<string, object[]>}
     */
    static #edgeGroups(edges) {
        const groups = new Map()
        for (const edge of edges) {
            if (!groups.has(edge.groupKey)) groups.set(edge.groupKey, [])
            groups.get(edge.groupKey).push(edge)
        }
        return groups
    }

    /**
     * Appends all trace routes for one net group.
     * @param {object[]} circuitJson Circuit JSON elements.
     * @param {string} idScope Deterministic id scope.
     * @param {object[]} edges Net-scoped graph edges.
     * @param {number} traceIndex Initial trace index.
     * @param {object[]} portPlacements Known PCB port placements.
     * @returns {number}
     */
    static #appendGroup(
        circuitJson,
        idScope,
        edges,
        traceIndex,
        portPlacements
    ) {
        const graph = CircuitJsonPcbTraceRouteBuilder.#graph(edges)
        const unvisited = new Set(edges.map((edge) => edge.id))
        let nextTraceIndex = traceIndex

        while (unvisited.size > 0) {
            const firstEdgeId = unvisited.values().next().value
            const componentIds =
                CircuitJsonPcbTraceRouteBuilder.#componentEdgeIds(
                    firstEdgeId,
                    graph,
                    unvisited
                )
            const startKey = CircuitJsonPcbTraceRouteBuilder.#startKey(
                componentIds,
                graph,
                portPlacements
            )
            const path = CircuitJsonPcbTraceRouteBuilder.#walkPath(
                startKey,
                componentIds,
                graph,
                unvisited
            )
            const route = CircuitJsonPcbTraceRouteBuilder.#routeForPath(path)

            if (route.length < 2) continue

            CircuitJsonPcbTraceRouteBuilder.#appendTrace(
                circuitJson,
                idScope,
                edges,
                path,
                route,
                nextTraceIndex,
                portPlacements
            )
            nextTraceIndex += 1
        }

        return nextTraceIndex
    }

    /**
     * Builds graph indexes from edges.
     * @param {object[]} edges Graph edges.
     * @returns {{ adjacency: Map<string, string[]>, edgesById: Map<string, object>, nodes: Map<string, object> }}
     */
    static #graph(edges) {
        const adjacency = new Map()
        const edgesById = new Map()
        const nodes = new Map()

        for (const edge of edges) {
            edgesById.set(edge.id, edge)
            CircuitJsonPcbTraceRouteBuilder.#addNode(
                adjacency,
                nodes,
                edge.startKey,
                edge.start,
                edge.startLayer
            )
            CircuitJsonPcbTraceRouteBuilder.#addNode(
                adjacency,
                nodes,
                edge.endKey,
                edge.end,
                edge.endLayer
            )
            adjacency.get(edge.startKey).push(edge.id)
            adjacency.get(edge.endKey).push(edge.id)
        }

        return { adjacency, edgesById, nodes }
    }

    /**
     * Adds a node to graph indexes.
     * @param {Map<string, string[]>} adjacency Adjacency index.
     * @param {Map<string, object>} nodes Node metadata.
     * @param {string} key Node key.
     * @param {{ x: number, y: number }} point Node point.
     * @param {string} layer Node layer.
     * @returns {void}
     */
    static #addNode(adjacency, nodes, key, point, layer) {
        if (!adjacency.has(key)) adjacency.set(key, [])
        if (!nodes.has(key)) nodes.set(key, { key, point, layer })
    }

    /**
     * Returns the connected unvisited edge ids for one component.
     * @param {string} firstEdgeId First edge id.
     * @param {object} graph Graph indexes.
     * @param {Set<string>} unvisited Unvisited edge ids.
     * @returns {Set<string>}
     */
    static #componentEdgeIds(firstEdgeId, graph, unvisited) {
        const componentIds = new Set()
        const firstEdge = graph.edgesById.get(firstEdgeId)
        const queue = [firstEdge.startKey, firstEdge.endKey]
        const seenNodes = new Set()

        while (queue.length > 0) {
            const nodeKey = queue.shift()
            if (seenNodes.has(nodeKey)) continue
            seenNodes.add(nodeKey)

            for (const edgeId of graph.adjacency.get(nodeKey) || []) {
                if (!unvisited.has(edgeId) || componentIds.has(edgeId)) {
                    continue
                }
                componentIds.add(edgeId)
                const edge = graph.edgesById.get(edgeId)
                queue.push(edge.startKey, edge.endKey)
            }
        }

        return componentIds
    }

    /**
     * Chooses a stable path start node.
     * @param {Set<string>} componentIds Component edge ids.
     * @param {object} graph Graph indexes.
     * @param {object[]} portPlacements Known PCB port placements.
     * @returns {string}
     */
    static #startKey(componentIds, graph, portPlacements) {
        const nodeKeys = CircuitJsonPcbTraceRouteBuilder.#componentNodeKeys(
            componentIds,
            graph
        )
        const terminalKeys = nodeKeys.filter((nodeKey) => {
            return (
                CircuitJsonPcbTraceRouteBuilder.#componentDegree(
                    nodeKey,
                    graph,
                    componentIds
                ) !== 2
            )
        })
        const candidates = [...terminalKeys, ...nodeKeys]
        const portNodeKey = candidates.find((nodeKey) =>
            CircuitJsonPcbTraceRouteBuilder.#hasPortAtNode(
                nodeKey,
                graph,
                portPlacements
            )
        )

        return portNodeKey || candidates[0]
    }

    /**
     * Walks one path through unvisited component edges.
     * @param {string} startKey Start node key.
     * @param {Set<string>} componentIds Component edge ids.
     * @param {object} graph Graph indexes.
     * @param {Set<string>} unvisited Unvisited edge ids.
     * @returns {object[]}
     */
    static #walkPath(startKey, componentIds, graph, unvisited) {
        const path = []
        let currentKey = startKey

        while (path.length <= componentIds.size) {
            const nextEdgeId = (graph.adjacency.get(currentKey) || []).find(
                (edgeId) => componentIds.has(edgeId) && unvisited.has(edgeId)
            )
            if (!nextEdgeId) break

            const edge = graph.edgesById.get(nextEdgeId)
            const oriented = CircuitJsonPcbTraceRouteBuilder.#orientedEdge(
                edge,
                currentKey
            )
            path.push(oriented)
            unvisited.delete(nextEdgeId)
            currentKey = oriented.endKey
        }

        return path
    }

    /**
     * Builds Circuit JSON route points for one ordered path.
     * @param {object[]} path Ordered graph path.
     * @returns {object[]}
     */
    static #routeForPath(path) {
        const route = []
        for (const oriented of path) {
            const edge = oriented.edge
            if (edge.kind === 'via') {
                route.push(
                    CircuitJsonPcbTraceRouteBuilder.#viaRoutePoint(oriented)
                )
                continue
            }

            const points = oriented.forward
                ? edge.points
                : [...edge.points].reverse()
            for (const point of points) {
                CircuitJsonPcbTraceRouteBuilder.#appendWireRoutePoint(
                    route,
                    point,
                    edge.width,
                    edge.layer
                )
            }
        }
        return route
    }

    /**
     * Appends one source trace and PCB trace element.
     * @param {object[]} circuitJson Circuit JSON elements.
     * @param {string} idScope Deterministic id scope.
     * @param {object[]} groupEdges Net group edges.
     * @param {object[]} path Ordered graph path.
     * @param {object[]} route Circuit JSON route points.
     * @param {number} traceIndex Trace index.
     * @param {object[]} portPlacements Known PCB port placements.
     * @returns {void}
     */
    static #appendTrace(
        circuitJson,
        idScope,
        groupEdges,
        path,
        route,
        traceIndex,
        portPlacements
    ) {
        const sourceNetId = path
            .map((oriented) => oriented.edge.sourceNetId)
            .find(Boolean)
        const sourceTraceId = Primitives.id(idScope, [
            'source_trace',
            sourceNetId || groupEdges[0]?.groupKey || 'trace',
            traceIndex
        ])
        const connectedSourcePortIds =
            CircuitJsonPcbTraceRouteBuilder.#connectedSourcePortIds(
                route,
                portPlacements,
                sourceNetId
            )

        circuitJson.push({
            type: 'source_trace',
            source_trace_id: sourceTraceId,
            connected_source_port_ids: connectedSourcePortIds,
            connected_source_net_ids: sourceNetId ? [sourceNetId] : []
        })
        circuitJson.push({
            type: 'pcb_trace',
            pcb_trace_id: Primitives.id(idScope, ['pcb_trace', traceIndex]),
            source_trace_id: sourceTraceId,
            route
        })
    }

    /**
     * Returns source port ids connected to trace endpoints.
     * @param {object[]} route Circuit JSON route points.
     * @param {object[]} portPlacements Known PCB port placements.
     * @param {string | undefined} sourceNetId Source net id.
     * @returns {string[]}
     */
    static #connectedSourcePortIds(route, portPlacements, sourceNetId) {
        const firstWire = route.find((point) => point.route_type === 'wire')
        const lastWire = [...route]
            .reverse()
            .find((point) => point.route_type === 'wire')
        const startPort = firstWire
            ? CircuitJsonRouteEndpointResolver.findPort(
                  portPlacements,
                  firstWire,
                  firstWire.layer,
                  sourceNetId
              )
            : undefined
        const endPort = lastWire
            ? CircuitJsonRouteEndpointResolver.findPort(
                  portPlacements,
                  lastWire,
                  lastWire.layer,
                  sourceNetId
              )
            : undefined

        if (startPort && firstWire)
            firstWire.start_pcb_port_id = startPort.pcbPortId
        if (endPort && lastWire) lastWire.end_pcb_port_id = endPort.pcbPortId

        return CircuitJsonPcbTraceRouteBuilder.#routeSourcePortIds(
            route,
            portPlacements,
            sourceNetId
        )
    }

    /**
     * Returns source port ids for all route points that touch PCB ports.
     * @param {object[]} route Circuit JSON route points.
     * @param {object[]} portPlacements Known PCB port placements.
     * @param {string | undefined} sourceNetId Source net id.
     * @returns {string[]}
     */
    static #routeSourcePortIds(route, portPlacements, sourceNetId) {
        const placements = []

        for (const point of route) {
            if (point.route_type !== 'wire') continue

            const placement = CircuitJsonRouteEndpointResolver.findPort(
                portPlacements,
                point,
                point.layer,
                sourceNetId
            )
            if (placement) placements.push(placement)
        }

        return CircuitJsonRouteEndpointResolver.sourcePortIds(placements)
    }

    /**
     * Appends one wire route point unless it duplicates the previous point.
     * @param {object[]} route Current route.
     * @param {{ x: number, y: number }} point Wire point.
     * @param {number} width Trace width.
     * @param {string} layer Trace layer.
     * @returns {void}
     */
    static #appendWireRoutePoint(route, point, width, layer) {
        const previous = route.at(-1)
        if (
            previous &&
            CircuitJsonPcbTraceRouteBuilder.#routePointMatches(
                previous,
                point
            ) &&
            (previous.layer === layer || previous.to_layer === layer)
        ) {
            return
        }

        route.push({
            route_type: 'wire',
            x: point.x,
            y: point.y,
            width,
            layer
        })
    }

    /**
     * Builds one via route point.
     * @param {object} oriented Oriented via edge.
     * @returns {object}
     */
    static #viaRoutePoint(oriented) {
        const edge = oriented.edge
        return {
            route_type: 'via',
            x: edge.point.x,
            y: edge.point.y,
            from_layer: CircuitJsonPcbTraceRouteBuilder.#nodeLayer(
                oriented.startKey
            ),
            to_layer: CircuitJsonPcbTraceRouteBuilder.#nodeLayer(
                oriented.endKey
            ),
            outer_diameter: edge.outerDiameter,
            hole_diameter: edge.holeDiameter
        }
    }

    /**
     * Returns one edge oriented from the current graph node.
     * @param {object} edge Graph edge.
     * @param {string} currentKey Current node key.
     * @returns {object}
     */
    static #orientedEdge(edge, currentKey) {
        const forward = currentKey === edge.startKey
        return {
            edge,
            forward,
            startKey: forward ? edge.startKey : edge.endKey,
            endKey: forward ? edge.endKey : edge.startKey
        }
    }

    /**
     * Returns all node keys touched by a component.
     * @param {Set<string>} componentIds Component edge ids.
     * @param {object} graph Graph indexes.
     * @returns {string[]}
     */
    static #componentNodeKeys(componentIds, graph) {
        const keys = new Set()
        for (const edgeId of componentIds) {
            const edge = graph.edgesById.get(edgeId)
            keys.add(edge.startKey)
            keys.add(edge.endKey)
        }
        return [...keys]
    }

    /**
     * Returns a component-local node degree.
     * @param {string} nodeKey Node key.
     * @param {object} graph Graph indexes.
     * @param {Set<string>} componentIds Component edge ids.
     * @returns {number}
     */
    static #componentDegree(nodeKey, graph, componentIds) {
        return (graph.adjacency.get(nodeKey) || []).filter((edgeId) =>
            componentIds.has(edgeId)
        ).length
    }

    /**
     * Returns true when a graph node has a matching PCB port.
     * @param {string} nodeKey Node key.
     * @param {object} graph Graph indexes.
     * @param {object[]} portPlacements Known PCB port placements.
     * @returns {boolean}
     */
    static #hasPortAtNode(nodeKey, graph, portPlacements) {
        const node = graph.nodes.get(nodeKey)
        return Boolean(
            node &&
            CircuitJsonRouteEndpointResolver.findPort(
                portPlacements,
                node.point,
                node.layer,
                undefined
            )
        )
    }

    /**
     * Returns sampled arc points.
     * @param {{ x: number, y: number }} center Center point.
     * @param {number} radius Radius.
     * @param {number} startAngle Start angle in degrees.
     * @param {number} sweepAngle Sweep angle in degrees.
     * @returns {{ x: number, y: number }[]}
     */
    static #arcPoints(center, radius, startAngle, sweepAngle) {
        const segments = Math.max(2, Math.ceil(Math.abs(sweepAngle) / 15))
        return Array.from({ length: segments + 1 }, (_, index) => {
            const angle =
                ((startAngle + (sweepAngle * index) / segments) * Math.PI) / 180
            return {
                x: Primitives.round(center.x + Math.cos(angle) * radius),
                y: Primitives.round(center.y + Math.sin(angle) * radius)
            }
        })
    }

    /**
     * Returns a usable sweep angle for an arc primitive.
     * @param {Record<string, unknown>} arc Arc primitive.
     * @returns {number}
     */
    static #arcSweepAngle(arc) {
        const explicitSweep = Primitives.number(arc.sweepAngle, null)
        if (explicitSweep !== null) return explicitSweep

        const startAngle = Primitives.number(arc.startAngle, 0) || 0
        const endAngle = Primitives.number(arc.endAngle, startAngle) || 0
        return endAngle - startAngle
    }

    /**
     * Returns a grouping key from primitive net metadata.
     * @param {Record<string, unknown>} primitive Primitive.
     * @returns {string}
     */
    static #primitiveNetKey(primitive) {
        return String(
            primitive.netName || primitive.net || primitive.netIndex || ''
        ).trim()
    }

    /**
     * Returns a stable graph node key.
     * @param {{ x: number, y: number }} point Point.
     * @param {string} layer Layer.
     * @returns {string}
     */
    static #nodeKey(point, layer) {
        return [
            layer,
            CircuitJsonPcbTraceRouteBuilder.#coordinateKey(point.x),
            CircuitJsonPcbTraceRouteBuilder.#coordinateKey(point.y)
        ].join(':')
    }

    /**
     * Returns the layer encoded in a graph node key.
     * @param {string} key Node key.
     * @returns {string}
     */
    static #nodeLayer(key) {
        return String(key).split(':')[0] || 'top'
    }

    /**
     * Returns a rounded coordinate key.
     * @param {number} coordinate Coordinate.
     * @returns {string}
     */
    static #coordinateKey(coordinate) {
        return String(Math.round(Number(coordinate || 0) * 1_000_000))
    }

    /**
     * Returns true when two points match at routing precision.
     * @param {{ x: number, y: number }} first First point.
     * @param {{ x: number, y: number }} second Second point.
     * @returns {boolean}
     */
    static #pointsMatch(first, second) {
        return (
            Math.abs(Number(first?.x || 0) - Number(second?.x || 0)) <
                endpointTolerance &&
            Math.abs(Number(first?.y || 0) - Number(second?.y || 0)) <
                endpointTolerance
        )
    }

    /**
     * Returns true when a route point has the same coordinate.
     * @param {object} routePoint Existing route point.
     * @param {{ x: number, y: number }} point Candidate point.
     * @returns {boolean}
     */
    static #routePointMatches(routePoint, point) {
        return CircuitJsonPcbTraceRouteBuilder.#pointsMatch(routePoint, point)
    }
}
