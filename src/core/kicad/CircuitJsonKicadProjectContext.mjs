// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'
import { CircuitJsonKicadProjectMetadata as Metadata } from './CircuitJsonKicadProjectMetadata.mjs'
import { CircuitJsonKicadProjectSchematicSymbolBuilder as SchematicSymbolBuilder } from './CircuitJsonKicadProjectSchematicSymbolBuilder.mjs'
import { CircuitJsonKicadProjectPcbPadBuilder as PadBuilder } from './CircuitJsonKicadProjectPcbPadBuilder.mjs'
import { CircuitJsonKicadProjectModelRouting as ModelRouting } from './CircuitJsonKicadProjectModelRouting.mjs'
import { CircuitJsonSourceComponentFtype } from '../circuit-json/CircuitJsonSourceComponentFtype.mjs'

const REFERENCE_PREFIX_BY_FTYPE = new Map([
    ['simple_resistor', 'R'],
    ['simple_capacitor', 'C'],
    ['simple_inductor', 'L'],
    ['simple_diode', 'D'],
    ['simple_led', 'D'],
    ['simple_switch', 'SW'],
    ['simple_push_button', 'SW'],
    ['simple_potentiometer', 'RV']
])

/**
 * Builds indexed context for CircuitJSON project export.
 */
export class CircuitJsonKicadProjectContext {
    /**
     * Builds the export context.
     * @param {object[] | { circuitJson?: object[], elements?: object[] }} circuitJson CircuitJSON source.
     * @param {{ projectName?: string, libraryName?: string, modelFiles?: object[], modelSourceRules?: object[], modelPathPrefix?: string, modelPathMode?: string, modelDirectory?: string, libraryTableRoot?: string, packageId?: string, useGenericConnectorSymbols?: boolean, schematicScaleFactor?: number, schematicCenterOnPage?: boolean }} [options] Context options.
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
        const sourceNets = CircuitJsonKicadProjectContext.sourceNets(elements)
        const sourceTraces =
            CircuitJsonKicadProjectContext.sourceTraces(elements)
        const sourceTracesByPort =
            CircuitJsonKicadProjectContext.sourceTracesByPort(sourceTraces)
        const sourcePorts = CircuitJsonKicadProjectContext.sourcePorts(elements)
        const pcbPorts = CircuitJsonKicadProjectContext.pcbPorts(elements)
        const pcbComponents = elements.filter(
            (element) => element?.type === 'pcb_component'
        )
        const cadComponents =
            CircuitJsonKicadProjectContext.cadComponents(elements)
        const schematicComponents = elements.filter(
            (element) => element?.type === 'schematic_component'
        )
        const componentRows = CircuitJsonKicadProjectContext.componentRows(
            sourceComponents,
            pcbComponents,
            schematicComponents,
            elements
        )
        const standaloneFootprintRows =
            CircuitJsonKicadProjectContext.standaloneFootprintRows(elements)

        const modelDirectory = CircuitJsonKicadProjectContext.modelDirectory(
            options,
            libraryName
        )
        const modelFiles = CircuitJsonKicadProjectContext.modelFiles(
            options.modelFiles,
            {
                ...options,
                modelDirectory
            }
        )
        const modelDirectories = ModelRouting.modelDirectories(
            modelFiles,
            modelDirectory
        )

        return {
            projectName,
            libraryName,
            elements,
            metadata,
            board:
                elements.find((element) => element?.type === 'pcb_board') ||
                null,
            sourceComponents,
            sourceNets,
            sourceTraces,
            sourceTracesByPort,
            sourcePorts,
            pcbPorts,
            pcbComponents,
            cadComponents,
            schematicComponents,
            componentRows,
            footprintRows: [...componentRows, ...standaloneFootprintRows],
            netMap: CircuitJsonKicadProjectContext.netMap(elements),
            modelFiles,
            modelDirectory,
            modelDirectories,
            modelPathPrefix:
                options.modelPathPrefix ||
                '${KIPRJMOD}/' + modelDirectory + '/',
            libraryTableRoot:
                options.libraryTableRoot ||
                CircuitJsonKicadProjectContext.libraryTableRoot(options),
            useGenericConnectorSymbols:
                options.useGenericConnectorSymbols === true,
            schematicScaleFactor:
                CircuitJsonKicadProjectContext.schematicScaleFactor(options),
            schematicCenterOnPage:
                CircuitJsonKicadProjectContext.schematicCenterOnPage(options)
        }
    }

    /**
     * Resolves the schematic coordinate scale factor.
     * @param {object} options Context options.
     * @returns {number}
     */
    static schematicScaleFactor(options) {
        const scale = Utils.number(
            options.schematicScaleFactor ??
                options.schematicCoordinateScale ??
                options.schematic_scale_factor ??
                options.schematic_coordinate_scale,
            1
        )
        return scale > 0 ? scale : 1
    }

    /**
     * Resolves whether schematic content should be centered on the page.
     * @param {object} options Context options.
     * @returns {boolean}
     */
    static schematicCenterOnPage(options) {
        return (
            options.schematicCenterOnPage === true ||
            options.schematic_center_on_page === true
        )
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
     * Indexes source nets by id.
     * @param {object[]} elements CircuitJSON elements.
     * @returns {Map<string, object>}
     */
    static sourceNets(elements) {
        const map = new Map()
        for (const element of elements) {
            if (element?.type !== 'source_net') continue
            const id = Utils.text(element.source_net_id)
            if (id) map.set(id, element)
        }
        return map
    }

    /**
     * Indexes source traces by id.
     * @param {object[]} elements CircuitJSON elements.
     * @returns {Map<string, object>}
     */
    static sourceTraces(elements) {
        const map = new Map()
        for (const element of elements) {
            if (element?.type !== 'source_trace') continue
            const id = Utils.text(element.source_trace_id)
            if (id) map.set(id, element)
        }
        return map
    }

    /**
     * Indexes source traces by connected source port id.
     * @param {Map<string, object>} sourceTraces Source traces by id.
     * @returns {Map<string, object[]>}
     */
    static sourceTracesByPort(sourceTraces) {
        const byPort = new Map()
        for (const trace of sourceTraces.values()) {
            const portIds = Array.isArray(trace.connected_source_port_ids)
                ? trace.connected_source_port_ids
                : []
            for (const portId of portIds) {
                const id = Utils.text(portId)
                if (!id) continue
                if (!byPort.has(id)) byPort.set(id, [])
                byPort.get(id).push(trace)
            }
        }

        for (const traces of byPort.values()) {
            traces.sort((left, right) =>
                Utils.text(left.source_trace_id).localeCompare(
                    Utils.text(right.source_trace_id)
                )
            )
        }
        return byPort
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
     * Indexes CAD component rows by owning PCB component id.
     * @param {object[]} elements CircuitJSON elements.
     * @returns {{ byPcbComponentId: Map<string, object[]> }}
     */
    static cadComponents(elements) {
        const byPcbComponentId = new Map()

        for (const element of elements) {
            if (element?.type !== 'cad_component') continue
            const componentId = Utils.text(element.pcb_component_id)
            if (!componentId) continue
            if (!byPcbComponentId.has(componentId)) {
                byPcbComponentId.set(componentId, [])
            }
            byPcbComponentId.get(componentId).push(element)
        }

        return { byPcbComponentId }
    }

    /**
     * Builds source component rows.
     * @param {Map<string, object>} sourceComponents Source components.
     * @param {object[]} pcbComponents PCB components.
     * @param {object[]} schematicComponents Schematic components.
     * @param {object[]} elements CircuitJSON elements.
     * @returns {object[]}
     */
    static componentRows(
        sourceComponents,
        pcbComponents,
        schematicComponents,
        elements
    ) {
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
                    schematicComponents,
                    elements
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
     * @param {object[]} elements CircuitJSON elements.
     * @returns {object}
     */
    static componentRow(
        sourceId,
        sourceComponents,
        pcbComponents,
        schematicComponents,
        elements
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
        const schematicSymbol = SchematicSymbolBuilder.symbolFor(
            elements,
            schematicComponent
        )
        const name = Utils.safeName(
            sourceComponent.name ||
                sourceComponent.reference ||
                schematicSymbol?.name ||
                pcbComponent?.name ||
                pcbComponent?.pcb_component_id ||
                sourceId
        )
        const symbolName = Utils.safeName(schematicSymbol?.name || name)

        return {
            sourceId,
            sourceComponent,
            pcbComponent,
            schematicComponent,
            schematicSymbol,
            reference:
                CircuitJsonKicadProjectContext.reference(sourceComponent),
            referenceDesignator:
                CircuitJsonKicadProjectContext.referenceDesignator(
                    sourceComponent,
                    name
                ),
            value: CircuitJsonKicadProjectContext.componentValue(
                sourceComponent,
                name
            ),
            symbolName: Metadata.symbolName(sourceComponent, symbolName),
            footprintName: Metadata.footprintName(
                sourceComponent,
                pcbComponent,
                name
            )
        }
    }

    /**
     * Builds footprint rows for board-owned pads and holes.
     * @param {object[]} elements CircuitJSON elements.
     * @returns {object[]}
     */
    static standaloneFootprintRows(elements) {
        const usedNames = new Set()
        return elements
            .filter((element) =>
                ['pcb_smtpad', 'pcb_plated_hole', 'pcb_hole'].includes(
                    element?.type
                )
            )
            .filter((element) => !Utils.text(element.pcb_component_id))
            .map((element, index) => {
                const name = PadBuilder.uniqueStandaloneFootprintName(
                    PadBuilder.standaloneFootprintName(element, index),
                    usedNames
                )
                return CircuitJsonKicadProjectContext.standaloneFootprintRow(
                    element,
                    index,
                    name
                )
            })
    }

    /**
     * Builds one synthetic footprint row for a board-owned pad or hole.
     * @param {object} element Pad or hole element.
     * @param {number} index Fallback index.
     * @param {string} footprintName Resolved footprint name.
     * @returns {object}
     */
    static standaloneFootprintRow(element, index, footprintName) {
        const id = Utils.text(footprintName, 'board_pad_' + (index + 1))
        const name = Utils.safeName(footprintName || id)
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
     * @param {{ modelDirectory?: string, modelSourceRules?: object[] }} [options] Routing options.
     * @returns {{ name: string, sourcePath: string, bytes: Uint8Array, format: string, outputPath: string, modelPath: string }[]}
     */
    static modelFiles(modelFiles, options = {}) {
        const usedOutputPaths = new Set()
        return (Array.isArray(modelFiles) ? modelFiles : []).map(
            (model, index) =>
                ModelRouting.normalizeModelFile(
                    model,
                    index,
                    options,
                    usedOutputPaths
                )
        )
    }

    /**
     * Resolves the archive model directory.
     * @param {object} options Export options.
     * @param {string} libraryName Export library name.
     * @returns {string}
     */
    static modelDirectory(options, libraryName) {
        if (options.modelDirectory) {
            return Utils.normalizeBasePath(options.modelDirectory)
        }
        if (options.modelPathMode === 'library-shapes') {
            return '3dmodels/' + libraryName + '.3dshapes'
        }
        return 'models'
    }

    /**
     * Resolves the library-table URI root.
     * @param {object} options Export options.
     * @returns {string}
     */
    static libraryTableRoot(options) {
        if (options.packageId) {
            return (
                '${KICAD_USER_3RD_PARTY}/' + Utils.safeName(options.packageId)
            )
        }
        return '${KIPRJMOD}'
    }

    /**
     * Resolves one source component reference prefix.
     * @param {object} sourceComponent Source component.
     * @returns {string}
     */
    static reference(sourceComponent) {
        const explicitPrefix =
            CircuitJsonKicadProjectContext.referencePrefixFromText(
                sourceComponent.reference
            )
        if (explicitPrefix) return explicitPrefix

        const ftypePrefix =
            CircuitJsonKicadProjectContext.referencePrefixFromFtype(
                sourceComponent
            )
        if (ftypePrefix) return ftypePrefix

        return (
            CircuitJsonKicadProjectContext.referencePrefixFromText(
                sourceComponent.name
            ) || 'U'
        )
    }

    /**
     * Resolves one placed component reference designator.
     * @param {object} sourceComponent Source component.
     * @param {string} fallbackName Fallback component name.
     * @returns {string}
     */
    static referenceDesignator(sourceComponent, fallbackName) {
        const explicit = Utils.text(sourceComponent.reference)
        if (explicit) return Utils.safeName(explicit)

        const name = Utils.text(sourceComponent.name || fallbackName)
        if (/^[A-Za-z#]+[A-Za-z0-9_#?]*\d[A-Za-z0-9_#?]*$/u.test(name)) {
            return Utils.safeName(name)
        }

        return CircuitJsonKicadProjectContext.reference(sourceComponent)
    }

    /**
     * Resolves one source component value.
     * @param {object} sourceComponent Source component.
     * @param {string} fallbackName Fallback component name.
     * @returns {string}
     */
    static componentValue(sourceComponent, fallbackName) {
        const explicit = CircuitJsonKicadProjectContext.firstText(
            sourceComponent.value,
            sourceComponent.display_value,
            sourceComponent.component_value
        )
        if (explicit) return explicit

        const manufacturerPartNumber = Utils.text(
            sourceComponent.manufacturer_part_number
        )
        const ftype =
            CircuitJsonKicadProjectContext.componentFtype(sourceComponent)

        switch (ftype) {
            case 'simple_resistor':
                return CircuitJsonKicadProjectContext.firstText(
                    sourceComponent.display_resistance,
                    sourceComponent.resistance,
                    manufacturerPartNumber,
                    'R'
                )
            case 'simple_capacitor':
                return CircuitJsonKicadProjectContext.firstText(
                    sourceComponent.display_capacitance,
                    sourceComponent.capacitance,
                    manufacturerPartNumber,
                    'C'
                )
            case 'simple_inductor':
                return CircuitJsonKicadProjectContext.firstText(
                    sourceComponent.display_inductance,
                    sourceComponent.inductance,
                    manufacturerPartNumber,
                    'L'
                )
            case 'simple_diode':
                return manufacturerPartNumber || 'D'
            case 'simple_led':
                return manufacturerPartNumber || 'LED'
            case 'simple_switch':
            case 'simple_push_button':
                return manufacturerPartNumber || 'SW'
            case 'simple_potentiometer':
                return CircuitJsonKicadProjectContext.firstText(
                    sourceComponent.display_max_resistance,
                    sourceComponent.max_resistance,
                    manufacturerPartNumber,
                    'POT'
                )
            default:
                return manufacturerPartNumber || fallbackName
        }
    }

    /**
     * Resolves one source component function type.
     * @param {object} sourceComponent Source component.
     * @returns {string}
     */
    static componentFtype(sourceComponent) {
        const explicit = Utils.text(sourceComponent.ftype).toLowerCase()
        if (explicit) return explicit
        return sourceComponent.type === 'source_component'
            ? CircuitJsonSourceComponentFtype.infer(sourceComponent)
            : ''
    }

    /**
     * Resolves a reference prefix from source component function type.
     * @param {object} sourceComponent Source component.
     * @returns {string}
     */
    static referencePrefixFromFtype(sourceComponent) {
        return (
            REFERENCE_PREFIX_BY_FTYPE.get(
                CircuitJsonKicadProjectContext.componentFtype(sourceComponent)
            ) || ''
        )
    }

    /**
     * Resolves a reference prefix from text.
     * @param {unknown} value Candidate reference text.
     * @returns {string}
     */
    static referencePrefixFromText(value) {
        const match = /^[A-Z]+/u.exec(Utils.text(value))
        return match ? match[0] : ''
    }

    /**
     * Returns the first non-empty text value.
     * @param {...unknown} values Candidate values.
     * @returns {string}
     */
    static firstText(...values) {
        for (const value of values) {
            const text = Utils.text(value).trim()
            if (text) return text
        }
        return ''
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
            element?.type !== 'pcb_via' &&
            element?.type !== 'source_trace'
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
                element?.source_trace_id ||
                element?.subcircuit_connectivity_map_key ||
                ''
        )
    }
}
