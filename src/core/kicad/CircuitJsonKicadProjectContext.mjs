// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

/**
 * Builds indexed context for CircuitJSON project export.
 */
export class CircuitJsonKicadProjectContext {
    /**
     * Builds the export context.
     * @param {object[] | { circuitJson?: object[], elements?: object[] }} circuitJson CircuitJSON source.
     * @param {{ projectName?: string, libraryName?: string, modelFiles?: object[], modelPathPrefix?: string }} [options] Context options.
     * @returns {object}
     */
    static build(circuitJson, options = {}) {
        const elements = CircuitJsonKicadProjectContext.elements(circuitJson)
        const metadata = CircuitJsonKicadProjectContext.metadata(elements)
        const projectName = Utils.safeName(
            options.projectName || metadata?.name || 'circuit-json-project'
        )
        const libraryName = Utils.safeName(options.libraryName || projectName)
        const sourceComponents =
            CircuitJsonKicadProjectContext.sourceComponents(elements)
        const sourcePorts = CircuitJsonKicadProjectContext.sourcePorts(elements)
        const pcbPorts = CircuitJsonKicadProjectContext.pcbPorts(elements)
        const pcbComponents = elements.filter(
            (element) => element?.type === 'pcb_component'
        )
        const schematicComponents = elements.filter(
            (element) => element?.type === 'schematic_component'
        )
        const componentRows = CircuitJsonKicadProjectContext.componentRows(
            sourceComponents,
            pcbComponents,
            schematicComponents
        )
        const standaloneFootprintRows =
            CircuitJsonKicadProjectContext.standaloneFootprintRows(elements)

        return {
            projectName,
            libraryName,
            elements,
            metadata,
            board:
                elements.find((element) => element?.type === 'pcb_board') ||
                null,
            sourceComponents,
            sourcePorts,
            pcbPorts,
            pcbComponents,
            schematicComponents,
            componentRows,
            footprintRows: [...componentRows, ...standaloneFootprintRows],
            netMap: CircuitJsonKicadProjectContext.netMap(elements),
            modelFiles: CircuitJsonKicadProjectContext.modelFiles(
                options.modelFiles
            ),
            modelPathPrefix: options.modelPathPrefix || '${KIPRJMOD}/models/'
        }
    }

    /**
     * Returns source elements from common document wrappers.
     * @param {unknown} circuitJson Source value.
     * @returns {object[]}
     */
    static elements(circuitJson) {
        if (Array.isArray(circuitJson)) return circuitJson
        if (Array.isArray(circuitJson?.circuitJson))
            return circuitJson.circuitJson
        if (Array.isArray(circuitJson?.elements)) return circuitJson.elements
        return []
    }

    /**
     * Returns project metadata.
     * @param {object[]} elements CircuitJSON elements.
     * @returns {object | null}
     */
    static metadata(elements) {
        return (
            elements.find(
                (element) => element?.type === 'source_project_metadata'
            ) || null
        )
    }

    /**
     * Indexes source components by id.
     * @param {object[]} elements CircuitJSON elements.
     * @returns {Map<string, object>}
     */
    static sourceComponents(elements) {
        const map = new Map()
        for (const element of elements) {
            if (element?.type !== 'source_component') continue
            const id = Utils.text(element.source_component_id)
            if (id) map.set(id, element)
        }
        return map
    }

    /**
     * Indexes source ports by id and component id.
     * @param {object[]} elements CircuitJSON elements.
     * @returns {{ byId: Map<string, object>, byComponentId: Map<string, object[]> }}
     */
    static sourcePorts(elements) {
        const byId = new Map()
        const byComponentId = new Map()

        for (const element of elements) {
            if (element?.type !== 'source_port') continue
            const id = Utils.text(element.source_port_id)
            const componentId = Utils.text(element.source_component_id)
            if (id) byId.set(id, element)
            if (!componentId) continue
            if (!byComponentId.has(componentId)) {
                byComponentId.set(componentId, [])
            }
            byComponentId.get(componentId).push(element)
        }

        for (const ports of byComponentId.values()) {
            ports.sort((left, right) => {
                return (
                    CircuitJsonKicadProjectContext.pinNumber(left, 0) -
                    CircuitJsonKicadProjectContext.pinNumber(right, 0)
                )
            })
        }

        return { byId, byComponentId }
    }

    /**
     * Indexes PCB ports by id.
     * @param {object[]} elements CircuitJSON elements.
     * @returns {Map<string, object>}
     */
    static pcbPorts(elements) {
        const map = new Map()
        for (const element of elements) {
            if (element?.type !== 'pcb_port') continue
            const id = Utils.text(element.pcb_port_id)
            if (id) map.set(id, element)
        }
        return map
    }

    /**
     * Builds source component rows.
     * @param {Map<string, object>} sourceComponents Source components.
     * @param {object[]} pcbComponents PCB components.
     * @param {object[]} schematicComponents Schematic components.
     * @returns {object[]}
     */
    static componentRows(sourceComponents, pcbComponents, schematicComponents) {
        const sourceIds = new Set([
            ...sourceComponents.keys(),
            ...pcbComponents.map((component) =>
                Utils.text(component.source_component_id)
            ),
            ...schematicComponents.map((component) =>
                Utils.text(component.source_component_id)
            )
        ])

        return Array.from(sourceIds)
            .filter(Boolean)
            .map((sourceId) =>
                CircuitJsonKicadProjectContext.componentRow(
                    sourceId,
                    sourceComponents,
                    pcbComponents,
                    schematicComponents
                )
            )
            .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
    }

    /**
     * Builds one source component row.
     * @param {string} sourceId Source component id.
     * @param {Map<string, object>} sourceComponents Source components.
     * @param {object[]} pcbComponents PCB components.
     * @param {object[]} schematicComponents Schematic components.
     * @returns {object}
     */
    static componentRow(
        sourceId,
        sourceComponents,
        pcbComponents,
        schematicComponents
    ) {
        const sourceComponent = sourceComponents.get(sourceId) || {}
        const pcbComponent =
            pcbComponents.find(
                (component) =>
                    Utils.text(component.source_component_id) === sourceId
            ) || null
        const schematicComponent =
            schematicComponents.find(
                (component) =>
                    Utils.text(component.source_component_id) === sourceId
            ) || null
        const name = Utils.safeName(
            sourceComponent.name ||
                sourceComponent.reference ||
                pcbComponent?.name ||
                pcbComponent?.pcb_component_id ||
                sourceId
        )

        return {
            sourceId,
            sourceComponent,
            pcbComponent,
            schematicComponent,
            reference:
                CircuitJsonKicadProjectContext.reference(sourceComponent),
            value: Utils.text(sourceComponent.manufacturer_part_number) || name,
            symbolName: name,
            footprintName: name
        }
    }

    /**
     * Builds footprint rows for board-owned pads and holes.
     * @param {object[]} elements CircuitJSON elements.
     * @returns {object[]}
     */
    static standaloneFootprintRows(elements) {
        return elements
            .filter((element) =>
                ['pcb_smtpad', 'pcb_plated_hole', 'pcb_hole'].includes(
                    element?.type
                )
            )
            .filter((element) => !Utils.text(element.pcb_component_id))
            .map((element, index) =>
                CircuitJsonKicadProjectContext.standaloneFootprintRow(
                    element,
                    index
                )
            )
    }

    /**
     * Builds one synthetic footprint row for a board-owned pad or hole.
     * @param {object} element Pad or hole element.
     * @param {number} index Fallback index.
     * @returns {object}
     */
    static standaloneFootprintRow(element, index) {
        const id = Utils.text(
            element.pcb_smtpad_id ||
                element.pcb_plated_hole_id ||
                element.pcb_hole_id,
            'board_pad_' + (index + 1)
        )
        const name = Utils.safeName(id)
        const center = CircuitJsonKicadProjectContext.elementPoint(element) || {
            x: 0,
            y: 0
        }

        return {
            sourceId: 'board:' + id,
            sourceComponent: {},
            pcbComponent: {
                pcb_component_id: 'board:' + id,
                center,
                layer: element.layer || element.side || 'top',
                rotation: 0
            },
            schematicComponent: null,
            standalonePad: element,
            reference: '',
            value: name,
            symbolName: name,
            footprintName: name
        }
    }

    /**
     * Resolves an element point, including polygon centroids.
     * @param {object} element CircuitJSON element.
     * @returns {{ x: number, y: number } | null}
     */
    static elementPoint(element) {
        const point = Utils.point(element)
        if (point) return point
        const points = (Array.isArray(element?.points) ? element.points : [])
            .map((candidate) => Utils.point(candidate))
            .filter(Boolean)
        if (!points.length) return null
        return {
            x: Utils.round(
                points.reduce((sum, candidate) => sum + candidate.x, 0) /
                    points.length
            ),
            y: Utils.round(
                points.reduce((sum, candidate) => sum + candidate.y, 0) /
                    points.length
            )
        }
    }

    /**
     * Builds a KiCad net name to id map.
     * @param {object[]} elements CircuitJSON elements.
     * @returns {Map<string, number>}
     */
    static netMap(elements) {
        const names = new Set()
        for (const element of elements) {
            const name =
                element?.type === 'source_net'
                    ? Utils.text(
                          element.raw_name ||
                              element.name ||
                              element.source_net_id
                      )
                    : CircuitJsonKicadProjectContext.netName(element)
            if (name) names.add(name)
        }

        const map = new Map()
        Array.from(names)
            .sort((left, right) => left.localeCompare(right))
            .forEach((name, index) => map.set(name, index + 1))
        return map
    }

    /**
     * Normalizes caller-provided model files.
     * @param {unknown} modelFiles Candidate model files.
     * @returns {{ name: string, sourcePath: string, bytes: Uint8Array, format: string }[]}
     */
    static modelFiles(modelFiles) {
        return (Array.isArray(modelFiles) ? modelFiles : []).map(
            (model, index) => {
                const sourcePath = Utils.text(
                    model.sourcePath || model.path || model.relativePath || ''
                )
                const name = Utils.safeFileName(
                    model.name ||
                        Utils.baseName(sourcePath) ||
                        'model-' + (index + 1) + '.step'
                )

                return {
                    name,
                    sourcePath,
                    bytes: Utils.bytes(model.bytes),
                    format: Utils.text(model.format) || Utils.extension(name)
                }
            }
        )
    }

    /**
     * Resolves one source component reference prefix.
     * @param {object} sourceComponent Source component.
     * @returns {string}
     */
    static reference(sourceComponent) {
        const name = Utils.text(
            sourceComponent.name || sourceComponent.reference || ''
        )
        const match = /^[A-Z]+/u.exec(name)
        return match ? match[0] : 'U'
    }

    /**
     * Resolves one source port pin number.
     * @param {object} port Source port.
     * @param {number} fallback Fallback pin number.
     * @returns {number | string}
     */
    static pinNumber(port, fallback) {
        return port?.pin_number ?? port?.pinNumber ?? fallback
    }

    /**
     * Resolves a net name from common element fields.
     * @param {object} element CircuitJSON element.
     * @returns {string}
     */
    static netName(element) {
        if (
            element?.type !== 'pcb_smtpad' &&
            element?.type !== 'pcb_plated_hole' &&
            element?.type !== 'pcb_hole' &&
            element?.type !== 'pcb_copper_pour' &&
            element?.type !== 'pcb_ground_plane' &&
            element?.type !== 'pcb_ground_plane_region' &&
            element?.type !== 'pcb_trace' &&
            element?.type !== 'pcb_via'
        ) {
            return ''
        }
        return Utils.text(
            element?.net ||
                element?.netName ||
                element?.raw_net_name ||
                element?.net_name ||
                element?.source_net_id ||
                element?.connection_name ||
                ''
        )
    }
}
