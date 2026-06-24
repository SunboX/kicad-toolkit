// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonModelSchema } from './CircuitJsonModelSchema.mjs'
import { CircuitJsonModelAdapterPrimitives } from './CircuitJsonModelAdapterPrimitives.mjs'
import { CircuitJsonModelAdapterElements } from './CircuitJsonModelAdapterElements.mjs'
import { CircuitJsonPcbCopperPourBuilder } from './CircuitJsonPcbCopperPourBuilder.mjs'
import { CircuitJsonPcbTraceRouteBuilder } from './CircuitJsonPcbTraceRouteBuilder.mjs'
import { CircuitJsonProjectMetadataBuilder } from './CircuitJsonProjectMetadataBuilder.mjs'
import { CircuitJsonSchematicLibraryBuilder } from './CircuitJsonSchematicLibraryBuilder.mjs'
import { CircuitJsonSchematicTraceBuilder } from './CircuitJsonSchematicTraceBuilder.mjs'
import { CircuitJsonSourceComponentFtype } from './CircuitJsonSourceComponentFtype.mjs'
import { CircuitJsonSourceComponentMetadata } from './CircuitJsonSourceComponentMetadata.mjs'

const Primitives = CircuitJsonModelAdapterPrimitives
const Elements = CircuitJsonModelAdapterElements

/**
 * Converts between legacy renderer models and Circuit JSON element arrays.
 */
export class CircuitJsonModelAdapter {
    /**
     * Converts a renderer model to a Circuit JSON array.
     * @param {Record<string, unknown> | object[]} rendererModel
     * @returns {object[]}
     */
    static fromRendererModel(rendererModel) {
        if (CircuitJsonModelSchema.isModel(rendererModel)) {
            return CircuitJsonModelSchema.attach(rendererModel)
        }

        const model = rendererModel || {}
        const circuitJson = []
        const sourceFormat = Primitives.sourceFormat(model)
        const idScope = Primitives.idScope(model, sourceFormat)

        const projectMetadata = CircuitJsonModelAdapter.#appendProjectMetadata(
            circuitJson,
            model,
            sourceFormat
        )

        if (model.schematic) {
            CircuitJsonModelAdapter.#appendSchematic(
                circuitJson,
                model,
                idScope
            )
        }

        if (model.pcb) {
            CircuitJsonModelAdapter.#appendPcb(circuitJson, model, idScope)
        }

        if (model.pcbLibrary) {
            CircuitJsonModelAdapter.#appendPcbLibrary(
                circuitJson,
                model,
                idScope
            )
        }

        if (model.schematicLibrary) {
            CircuitJsonSchematicLibraryBuilder.append(
                circuitJson,
                model,
                idScope
            )
        }

        CircuitJsonModelAdapter.#appendBom(circuitJson, model, idScope)
        CircuitJsonProjectMetadataBuilder.finalize(
            projectMetadata,
            circuitJson,
            model
        )
        CircuitJsonModelAdapter.#attachCompatibility(circuitJson, model)

        return CircuitJsonModelSchema.attach(circuitJson)
    }

    /**
     * Returns a renderer-compatible model for Circuit JSON parser output.
     * @param {object[] | Record<string, unknown>} circuitJson
     * @returns {Record<string, unknown>}
     */
    static toRendererModel(circuitJson) {
        if (
            circuitJson &&
            typeof circuitJson === 'object' &&
            !Array.isArray(circuitJson)
        ) {
            return circuitJson
        }

        if (
            circuitJson?.kind ||
            circuitJson?.schematic ||
            circuitJson?.pcb ||
            circuitJson?.pcbLibrary ||
            circuitJson?.project
        ) {
            return circuitJson
        }

        CircuitJsonModelSchema.assertModel(circuitJson)

        const metadata = circuitJson.find(
            (element) => element.type === 'source_project_metadata'
        )
        const hasPcb = circuitJson.some((element) =>
            String(element.type).startsWith('pcb_')
        )
        const hasSchematic = circuitJson.some((element) =>
            String(element.type).startsWith('schematic_')
        )

        return {
            schema: CircuitJsonModelSchema.CURRENT_SCHEMA_ID,
            kind: hasPcb ? 'pcb' : hasSchematic ? 'schematic' : 'project',
            fileType: 'CircuitJson',
            fileName: metadata?.name || 'circuit.json',
            summary: {
                title: metadata?.name || 'Circuit JSON',
                elementCount: circuitJson.length
            },
            diagnostics: [],
            circuitJson
        }
    }

    /**
     * Returns true when a value is a Circuit JSON model array.
     * @param {unknown} value
     * @returns {boolean}
     */
    static isCircuitJson(value) {
        return CircuitJsonModelSchema.isModel(value)
    }

    /**
     * Appends Circuit JSON project metadata.
     * @param {object[]} circuitJson
     * @param {Record<string, unknown>} model
     * @param {string} sourceFormat
     * @returns {Record<string, unknown>}
     */
    static #appendProjectMetadata(circuitJson, model, sourceFormat) {
        const projectMetadata = {
            type: 'source_project_metadata',
            name:
                String(model.summary?.title || '').trim() ||
                Primitives.stripExtension(model.fileName) ||
                'Untitled circuit',
            software_used_string: sourceFormat
        }

        circuitJson.push(projectMetadata)
        return projectMetadata
    }

    /**
     * Appends schematic elements.
     * @param {object[]} circuitJson
     * @param {Record<string, unknown>} model
     * @param {string} idScope
     * @returns {void}
     */
    static #appendSchematic(circuitJson, model, idScope) {
        const schematic = model.schematic || {}
        const componentIds = new Map()
        const portIds = new Map()
        const portIdsByKey = new Map()
        const netIds = new Map()

        for (const [componentIndex, component] of Primitives.array(
            schematic.components
        ).entries()) {
            const sourceComponentId = Primitives.id(idScope, [
                'source_component',
                component.designator || component.name || componentIndex
            ])
            componentIds.set(component, sourceComponentId)
            CircuitJsonModelAdapter.#indexSchematicComponent(
                componentIds,
                component,
                componentIndex,
                sourceComponentId
            )
            circuitJson.push(
                CircuitJsonModelAdapter.#sourceComponent(
                    sourceComponentId,
                    component,
                    componentIndex
                )
            )
            circuitJson.push({
                type: 'schematic_component',
                schematic_component_id: Primitives.id(idScope, [
                    'schematic_component',
                    component.designator || component.name || componentIndex
                ]),
                source_component_id: sourceComponentId,
                center: Primitives.point(component.x, component.y),
                size: {
                    width: Primitives.number(component.width, 0),
                    height: Primitives.number(component.height, 0)
                },
                rotation: Primitives.number(component.rotation, 0)
            })
        }

        for (const [pinIndex, pin] of Primitives.array(
            schematic.pins
        ).entries()) {
            const sourceComponentId =
                CircuitJsonModelAdapter.#sourceComponentIdForPin(
                    pin,
                    componentIds,
                    idScope,
                    circuitJson
                )
            const sourcePortId = Primitives.sourcePortId(
                idScope,
                pin,
                pinIndex,
                sourceComponentId
            )
            portIds.set(pin, sourcePortId)
            for (const key of CircuitJsonSchematicTraceBuilder.pinKeys(pin)) {
                portIdsByKey.set(key, sourcePortId)
            }
            circuitJson.push({
                type: 'source_port',
                source_port_id: sourcePortId,
                source_component_id: sourceComponentId,
                name: Primitives.string(
                    pin.name || pin.designator || pinIndex,
                    String(pinIndex + 1)
                ),
                pin_number:
                    Primitives.pinNumber(
                        pin.pinNumber || pin.designator || pin.name
                    ) ?? pinIndex + 1
            })
            circuitJson.push({
                type: 'schematic_port',
                schematic_port_id: Primitives.id(idScope, [
                    'schematic_port',
                    sourcePortId
                ]),
                source_port_id: sourcePortId,
                center: Primitives.point(pin.x, pin.y),
                facing_direction: Primitives.facingDirection(pin) || 'right'
            })
        }

        for (const [netIndex, net] of Primitives.array(
            schematic.nets
        ).entries()) {
            const netName = Primitives.string(net.name, `NET_${netIndex + 1}`)
            const sourceNetId = Primitives.sourceNetId(
                idScope,
                net.name || netIndex
            )
            netIds.set(net.name, sourceNetId)
            netIds.set(netName, sourceNetId)
            Elements.appendMissingSourceNet(circuitJson, sourceNetId, netName)
        }

        const consumedSchematicSegments =
            CircuitJsonSchematicTraceBuilder.append(
                circuitJson,
                idScope,
                schematic,
                netIds,
                portIds,
                portIdsByKey
            )

        for (const [lineIndex, line] of Primitives.array(
            schematic.lines
        ).entries()) {
            if (
                consumedSchematicSegments.has(
                    CircuitJsonSchematicTraceBuilder.segmentKey(line)
                )
            ) {
                continue
            }

            CircuitJsonModelAdapter.#appendSchematicLine(
                circuitJson,
                idScope,
                line,
                lineIndex,
                netIds
            )
        }

        for (const [textIndex, text] of Primitives.array(
            schematic.texts
        ).entries()) {
            CircuitJsonModelAdapter.#appendSchematicText(
                circuitJson,
                idScope,
                text,
                textIndex
            )
        }
    }

    /**
     * Appends PCB elements.
     * @param {object[]} circuitJson
     * @param {Record<string, unknown>} model
     * @param {string} idScope
     * @returns {void}
     */
    static #appendPcb(circuitJson, model, idScope) {
        const pcb = model.pcb || {}
        const componentIds = new Map()
        const sourceNetIds = new Map()
        const portPlacements = []
        const boardId = Primitives.id(idScope, ['pcb_board'])

        CircuitJsonModelAdapter.#appendPcbBoard(
            circuitJson,
            boardId,
            pcb.boardOutline,
            model,
            idScope
        )

        for (const [netIndex, net] of Primitives.array(pcb.nets).entries()) {
            const netName = Primitives.string(
                net.name || net.netName,
                `NET_${netIndex + 1}`
            )
            const sourceNetId = Primitives.sourceNetId(
                idScope,
                net.name || net.netName || netIndex
            )
            sourceNetIds.set(
                String(net.name || net.netName || netIndex),
                sourceNetId
            )
            sourceNetIds.set(netName, sourceNetId)
            Elements.appendMissingSourceNet(circuitJson, sourceNetId, netName)
        }

        for (const [componentIndex, component] of Primitives.array(
            pcb.components
        ).entries()) {
            const sourceComponentId = Primitives.id(idScope, [
                'source_component',
                component.designator || component.name || componentIndex
            ])
            const pcbComponentId = Primitives.id(idScope, [
                'pcb_component',
                component.designator || component.name || componentIndex
            ])
            componentIds.set(
                Primitives.componentKey(component, componentIndex),
                sourceComponentId
            )
            circuitJson.push(
                CircuitJsonModelAdapter.#sourceComponent(
                    sourceComponentId,
                    component,
                    componentIndex
                )
            )
            circuitJson.push({
                type: 'pcb_component',
                pcb_component_id: pcbComponentId,
                source_component_id: sourceComponentId,
                center: Primitives.milPoint(component.x, component.y),
                layer: Primitives.side(component.layer),
                rotation: Primitives.number(component.rotation, 0),
                width: Primitives.milNumber(
                    component.width || component.widthMil,
                    0
                ),
                height: Primitives.milNumber(
                    component.height || component.heightMil,
                    0
                )
            })
        }

        for (const [padIndex, pad] of Primitives.array(pcb.pads).entries()) {
            const portPlacement = CircuitJsonModelAdapter.#appendPcbPad(
                circuitJson,
                idScope,
                pad,
                padIndex,
                componentIds,
                sourceNetIds
            )
            if (portPlacement) portPlacements.push(portPlacement)
        }

        CircuitJsonPcbTraceRouteBuilder.append(
            circuitJson,
            idScope,
            pcb,
            sourceNetIds,
            portPlacements
        )
        CircuitJsonPcbCopperPourBuilder.append(
            circuitJson,
            idScope,
            pcb,
            sourceNetIds
        )

        for (const [viaIndex, via] of Primitives.array(pcb.vias).entries()) {
            CircuitJsonModelAdapter.#appendPcbVia(
                circuitJson,
                idScope,
                via,
                viaIndex,
                sourceNetIds
            )
        }
    }

    /**
     * Appends one PCB board element.
     * @param {object[]} circuitJson
     * @param {string} boardId
     * @param {Record<string, unknown>} boardOutline
     * @param {Record<string, unknown>} model
     * @param {string} idScope
     * @returns {void}
     */
    static #appendPcbBoard(circuitJson, boardId, boardOutline, model, idScope) {
        const widthMil =
            Primitives.number(boardOutline?.widthMil, null) ??
            Primitives.number(model.summary?.boardWidthMil, 0)
        const heightMil =
            Primitives.number(boardOutline?.heightMil, null) ??
            Primitives.number(model.summary?.boardHeightMil, 0)
        const minX = Primitives.number(boardOutline?.minX, 0)
        const minY = Primitives.number(boardOutline?.minY, 0)
        const outline = Primitives.outlinePoints(boardOutline)

        circuitJson.push({
            type: 'pcb_board',
            pcb_board_id: boardId,
            center: Primitives.milPoint(
                minX + widthMil / 2,
                minY + heightMil / 2
            ),
            width: Primitives.milNumber(widthMil, 0),
            height: Primitives.milNumber(heightMil, 0),
            thickness: 1.6,
            num_layers: Primitives.number(model.summary?.layerCount, 2),
            material: 'fr4',
            outline,
            shape: 'rect'
        })

        for (const [cutoutIndex, cutout] of Primitives.array(
            boardOutline?.cutouts
        ).entries()) {
            const points = Primitives.array(cutout.points).map((point) =>
                Primitives.milPoint(point.x, point.y)
            )
            if (points.length < 4) continue

            circuitJson.push({
                type: 'pcb_cutout',
                pcb_cutout_id: Primitives.id(idScope, [
                    'pcb_cutout',
                    cutoutIndex
                ]),
                pcb_board_id: boardId,
                shape: 'polygon',
                points
            })
        }
    }

    /**
     * Appends one PCB pad and related source port element.
     * @param {object[]} circuitJson
     * @param {string} idScope
     * @param {Record<string, unknown>} pad
     * @param {number} padIndex
     * @param {Map<string, string>} componentIds
     * @param {Map<string, string>} sourceNetIds
     * @returns {{ pcbPortId: string, sourcePortId: string, sourceNetId: string | undefined, center: object, layers: string[] }}
     */
    static #appendPcbPad(
        circuitJson,
        idScope,
        pad,
        padIndex,
        componentIds,
        sourceNetIds
    ) {
        const sourceComponentId =
            componentIds.get(String(pad.componentIndex)) ||
            componentIds.get('0') ||
            Primitives.id(idScope, ['source_component', 'unassigned'])
        const sourcePortId = Primitives.sourcePortId(
            idScope,
            pad,
            padIndex,
            sourceComponentId
        )
        const pcbPortId = Primitives.id(idScope, ['pcb_port', sourcePortId])
        const pcbComponentId = Primitives.id(idScope, [
            'pcb_component',
            pad.componentIndex ?? 'unassigned'
        ])
        const center = Primitives.milPoint(pad.x, pad.y)
        const layer = Primitives.layerName(pad)
        const layers = Primitives.layers(pad)
        const rawPortHint = Primitives.string(
            pad.name || pad.pinName || pad.pinNumber || pad.number,
            String(padIndex + 1)
        )
        const portHint = Primitives.sourcePortName(rawPortHint)
        const portHints = Primitives.sourcePortHints(portHint, rawPortHint)
        const sourceNetId = Elements.sourceNetIdForPrimitive(
            circuitJson,
            idScope,
            pad,
            sourceNetIds
        )
        const sourcePort = {
            type: 'source_port',
            source_port_id: sourcePortId,
            source_component_id: sourceComponentId,
            name: portHint,
            port_hints: portHints
        }
        const pinNumber = Primitives.pinNumber(rawPortHint)
        if (pinNumber !== undefined) sourcePort.pin_number = pinNumber

        circuitJson.push(sourcePort)
        circuitJson.push({
            type: 'pcb_port',
            pcb_port_id: pcbPortId,
            source_port_id: sourcePortId,
            pcb_component_id: pcbComponentId,
            x: center.x,
            y: center.y,
            layers
        })

        if (Primitives.isThroughHolePad(pad)) {
            Elements.appendPcbHole(circuitJson, idScope, pad, padIndex, {
                center,
                layers,
                pcbComponentId,
                pcbPortId,
                portHint,
                portHints
            })
            return {
                pcbPortId,
                sourcePortId,
                sourceNetId,
                center,
                layers
            }
        }

        const smtPad = {
            type: 'pcb_smtpad',
            pcb_smtpad_id: Primitives.id(idScope, ['pcb_smtpad', sourcePortId]),
            pcb_component_id: pcbComponentId,
            pcb_port_id: pcbPortId,
            x: center.x,
            y: center.y,
            layer,
            port_hints: portHints,
            shape: Primitives.padShape(pad)
        }
        const geometry = Primitives.smtPadGeometry(pad)

        smtPad.shape = geometry.shape
        if (geometry.shape === 'polygon') {
            smtPad.points = geometry.points
        } else if (smtPad.shape === 'circle') {
            smtPad.radius = Primitives.round(
                Math.max(geometry.width, geometry.height) / 2
            )
        } else {
            smtPad.width = geometry.width
            smtPad.height = geometry.height
            if (geometry.cornerRadius) {
                smtPad.corner_radius = geometry.cornerRadius
            }
            if (smtPad.shape === 'pill') {
                smtPad.radius = geometry.radius
            }
            if (geometry.rotation) {
                smtPad.shape =
                    smtPad.shape === 'pill' ? 'rotated_pill' : 'rotated_rect'
                smtPad.ccw_rotation = geometry.rotation
            }
        }

        circuitJson.push(smtPad)
        return {
            pcbPortId,
            sourcePortId,
            sourceNetId,
            center,
            layers
        }
    }

    /**
     * Appends one PCB via.
     * @param {object[]} circuitJson
     * @param {string} idScope
     * @param {Record<string, unknown>} via
     * @param {number} viaIndex
     * @param {Map<string, string>} sourceNetIds
     * @returns {void}
     */
    static #appendPcbVia(circuitJson, idScope, via, viaIndex, sourceNetIds) {
        Elements.sourceNetIdForPrimitive(
            circuitJson,
            idScope,
            via,
            sourceNetIds
        )
        circuitJson.push({
            type: 'pcb_via',
            pcb_via_id: Primitives.id(idScope, ['pcb_via', viaIndex]),
            x: Primitives.milNumber(via.x, 0),
            y: Primitives.milNumber(via.y, 0),
            outer_diameter: Primitives.milNumber(via.diameter, 0),
            hole_diameter: Primitives.milNumber(via.holeDiameter, 0),
            layers: Primitives.copperLayers(via)
        })
    }

    /**
     * Appends minimal PCB library elements as metadata.
     * @param {object[]} circuitJson
     * @param {Record<string, unknown>} model
     * @param {string} idScope
     * @returns {void}
     */
    static #appendPcbLibrary(circuitJson, model, idScope) {
        for (const [footprintIndex, footprint] of Primitives.array(
            model.pcbLibrary?.footprints
        ).entries()) {
            circuitJson.push({
                type: 'source_component',
                source_component_id: Primitives.id(idScope, [
                    'library_footprint',
                    footprint.name || footprint.pattern || footprintIndex
                ]),
                name: Primitives.string(
                    footprint.name || footprint.pattern,
                    `FOOTPRINT_${footprintIndex + 1}`
                ),
                ftype: CircuitJsonSourceComponentFtype.infer(footprint),
                ...CircuitJsonSourceComponentMetadata.fields(footprint)
            })
        }
    }

    /**
     * Appends BOM rows as source components when they are not already present.
     * @param {object[]} circuitJson
     * @param {Record<string, unknown>} model
     * @param {string} idScope
     * @returns {void}
     */
    static #appendBom(circuitJson, model, idScope) {
        const existingComponentIds = new Set(
            circuitJson
                .filter((element) => element.type === 'source_component')
                .map((element) => element.source_component_id)
        )

        for (const [rowIndex, row] of Primitives.array(model.bom).entries()) {
            for (const designator of Primitives.array(row.designators)) {
                const sourceComponentId = Primitives.id(idScope, [
                    'source_component',
                    designator
                ])
                if (existingComponentIds.has(sourceComponentId)) continue
                existingComponentIds.add(sourceComponentId)
                const component = {
                    ...row,
                    designator,
                    value: row.value,
                    pattern: row.pattern,
                    source: row.source
                }
                circuitJson.push({
                    type: 'source_component',
                    source_component_id: sourceComponentId,
                    name: Primitives.string(designator, `BOM_${rowIndex + 1}`),
                    display_value: Primitives.string(row.value, ''),
                    footprint: Primitives.string(row.pattern, ''),
                    manufacturer_part_number: Primitives.string(row.source, ''),
                    ftype: CircuitJsonSourceComponentFtype.infer(component),
                    ...CircuitJsonSourceComponentMetadata.fields(component)
                })
            }
        }
    }

    /**
     * Appends one schematic line or trace.
     * @param {object[]} circuitJson
     * @param {string} idScope
     * @param {Record<string, unknown>} line
     * @param {number} lineIndex
     * @param {Map<string, string>} netIds
     * @returns {void}
     */
    static #appendSchematicLine(circuitJson, idScope, line, lineIndex, netIds) {
        const schematicLineId = Primitives.id(idScope, [
            'schematic_line',
            lineIndex
        ])
        const lineElement = {
            type: 'schematic_line',
            schematic_line_id: schematicLineId,
            x1: Primitives.number(line.x1, 0),
            y1: Primitives.number(line.y1, 0),
            x2: Primitives.number(line.x2, 0),
            y2: Primitives.number(line.y2, 0),
            stroke_width: Primitives.number(line.width, 1),
            is_dashed: line.dashed === true
        }
        circuitJson.push(lineElement)

        if (line.kind === 'wire' || line.netName || line.netIndex) {
            const sourceTraceId = Primitives.id(idScope, [
                'source_trace',
                line.netName || line.netIndex || lineIndex
            ])
            const sourceNetId = Elements.sourceNetIdForPrimitive(
                circuitJson,
                idScope,
                line,
                netIds
            )

            circuitJson.push({
                type: 'source_trace',
                source_trace_id: sourceTraceId,
                connected_source_port_ids: [],
                connected_source_net_ids: sourceNetId ? [sourceNetId] : []
            })
            circuitJson.push({
                type: 'schematic_trace',
                schematic_trace_id: Primitives.id(idScope, [
                    'schematic_trace',
                    lineIndex
                ]),
                source_trace_id: sourceTraceId,
                junctions: [],
                edges: [
                    {
                        from: {
                            x: lineElement.x1,
                            y: lineElement.y1
                        },
                        to: {
                            x: lineElement.x2,
                            y: lineElement.y2
                        }
                    }
                ]
            })
        }
    }

    /**
     * Appends one schematic text or net label.
     * @param {object[]} circuitJson
     * @param {string} idScope
     * @param {Record<string, unknown>} text
     * @param {number} textIndex
     * @returns {void}
     */
    static #appendSchematicText(circuitJson, idScope, text, textIndex) {
        const textValue = Primitives.string(
            text.text || text.value || text.name,
            ''
        )
        const position = Primitives.point(text.x, text.y)

        if (Primitives.isNetLabel(text)) {
            const sourceNetId = Primitives.sourceNetId(
                idScope,
                textValue || textIndex
            )
            Elements.appendMissingSourceNet(
                circuitJson,
                sourceNetId,
                textValue || String(textIndex)
            )
            circuitJson.push({
                type: 'schematic_net_label',
                schematic_net_label_id: Primitives.id(idScope, [
                    'schematic_net_label',
                    textIndex
                ]),
                source_net_id: sourceNetId,
                center: position,
                anchor_side: 'top',
                text: textValue
            })
            return
        }

        circuitJson.push({
            type: 'schematic_text',
            schematic_text_id: Primitives.id(idScope, [
                'schematic_text',
                textIndex
            ]),
            text: textValue,
            position,
            anchor: 'center'
        })
    }

    /**
     * Returns a source component id for one schematic pin.
     * @param {Record<string, unknown>} pin
     * @param {Map<object, string>} componentIds
     * @param {string} idScope
     * @param {object[]} circuitJson
     * @returns {string}
     */
    static #sourceComponentIdForPin(pin, componentIds, idScope, circuitJson) {
        const existingSourceComponentId = [
            pin.ownerIndex,
            pin.ownerDesignator,
            pin.owner,
            pin.component,
            pin.componentDesignator
        ]
            .map(
                (key) => componentIds.get(key) || componentIds.get(String(key))
            )
            .find(Boolean)
        if (existingSourceComponentId) return existingSourceComponentId

        const designator =
            pin.designator ||
            pin.ownerDesignator ||
            pin.owner ||
            pin.componentDesignator ||
            pin.component
        if (designator) {
            const sourceComponentId = Primitives.id(idScope, [
                'source_component',
                designator
            ])
            if (
                !circuitJson.some(
                    (element) =>
                        element.type === 'source_component' &&
                        element.source_component_id === sourceComponentId
                )
            ) {
                circuitJson.push({
                    type: 'source_component',
                    source_component_id: sourceComponentId,
                    name: Primitives.string(designator, 'U?'),
                    ftype: CircuitJsonSourceComponentFtype.infer({
                        designator
                    })
                })
            }
            return sourceComponentId
        }

        return (
            [...componentIds.values()][0] ||
            Primitives.id(idScope, ['source_component', 'unassigned'])
        )
    }

    /**
     * Adds schematic component lookup keys for later pin ownership matching.
     * @param {Map<unknown, string>} componentIds Component ids by lookup key.
     * @param {Record<string, unknown>} component Schematic component.
     * @param {number} componentIndex Component index.
     * @param {string} sourceComponentId Source component id.
     * @returns {void}
     */
    static #indexSchematicComponent(
        componentIds,
        component,
        componentIndex,
        sourceComponentId
    ) {
        for (const key of [
            component.componentIndex,
            component.ownerIndex,
            component.index,
            componentIndex,
            component.designator,
            component.name,
            component.reference
        ]) {
            const normalized = String(key ?? '').trim()
            if (normalized) componentIds.set(normalized, sourceComponentId)
        }
    }

    /**
     * Builds a source component element.
     * @param {string} sourceComponentId
     * @param {Record<string, unknown>} component
     * @param {number} componentIndex
     * @returns {object}
     */
    static #sourceComponent(sourceComponentId, component, componentIndex) {
        return {
            type: 'source_component',
            source_component_id: sourceComponentId,
            name: Primitives.string(
                component.designator || component.name,
                `U${componentIndex + 1}`
            ),
            display_value: Primitives.string(
                component.value || component.comment,
                ''
            ),
            footprint: Primitives.string(
                component.pattern || component.footprint,
                ''
            ),
            manufacturer_part_number: Primitives.string(component.source, ''),
            ftype: CircuitJsonSourceComponentFtype.infer(component),
            ...CircuitJsonSourceComponentMetadata.fields(component)
        }
    }

    /**
     * Attaches legacy renderer model fields to a Circuit JSON array.
     * @param {object[]} circuitJson
     * @param {Record<string, unknown>} rendererModel
     * @returns {void}
     */
    static #attachCompatibility(circuitJson, rendererModel) {
        Object.assign(circuitJson, rendererModel)
        Object.defineProperty(circuitJson, 'rendererModel', {
            configurable: true,
            enumerable: false,
            value: rendererModel,
            writable: true
        })
    }
}
