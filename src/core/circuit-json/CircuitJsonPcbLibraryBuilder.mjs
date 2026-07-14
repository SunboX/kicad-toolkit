// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonModelAdapterElements } from './CircuitJsonModelAdapterElements.mjs'
import { CircuitJsonModelAdapterPrimitives } from './CircuitJsonModelAdapterPrimitives.mjs'
import { CircuitJsonPcbArtworkBuilder } from './CircuitJsonPcbArtworkBuilder.mjs'
import { CircuitJsonPcbTextBuilder } from './CircuitJsonPcbTextBuilder.mjs'
import { CircuitJsonSourceComponentFtype } from './CircuitJsonSourceComponentFtype.mjs'
import { CircuitJsonSourceComponentMetadata } from './CircuitJsonSourceComponentMetadata.mjs'

const Elements = CircuitJsonModelAdapterElements
const Primitives = CircuitJsonModelAdapterPrimitives

/**
 * Builds Circuit JSON elements for standalone PCB footprint libraries.
 */
export class CircuitJsonPcbLibraryBuilder {
    /**
     * Appends standalone footprint library elements.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {Record<string, unknown>} model Renderer model.
     * @param {string} idScope Deterministic id scope.
     * @returns {void}
     */
    static append(circuitJson, model, idScope) {
        for (const [footprintIndex, footprint] of Primitives.array(
            model.pcbLibrary?.footprints
        ).entries()) {
            CircuitJsonPcbLibraryBuilder.#appendFootprint(
                circuitJson,
                idScope,
                footprint,
                footprintIndex
            )
        }
    }

    /**
     * Appends source and PCB projection elements for one footprint.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} footprint Footprint library row.
     * @param {number} footprintIndex Footprint index.
     * @returns {void}
     */
    static #appendFootprint(circuitJson, idScope, footprint, footprintIndex) {
        const sourceComponentId = Primitives.id(idScope, [
            'library_footprint',
            footprint.name || footprint.pattern || footprintIndex
        ])

        circuitJson.push({
            type: 'source_component',
            source_component_id: sourceComponentId,
            name: Primitives.string(
                footprint.name || footprint.pattern,
                `FOOTPRINT_${footprintIndex + 1}`
            ),
            ftype: CircuitJsonSourceComponentFtype.infer(footprint),
            ...CircuitJsonSourceComponentMetadata.fields(footprint)
        })
        CircuitJsonPcbLibraryBuilder.#appendFootprintGeometry(
            circuitJson,
            idScope,
            footprint,
            footprintIndex,
            sourceComponentId
        )
    }

    /**
     * Appends PCB-like geometry for one standalone footprint.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} footprint Footprint library row.
     * @param {number} footprintIndex Footprint index.
     * @param {string} sourceComponentId Source component id.
     * @returns {void}
     */
    static #appendFootprintGeometry(
        circuitJson,
        idScope,
        footprint,
        footprintIndex,
        sourceComponentId
    ) {
        const rawFootprint = footprint.kicadFootprint || footprint
        const footprintKey = Primitives.string(
            footprint.name ||
                footprint.footprintName ||
                rawFootprint.footprintName ||
                rawFootprint.libraryName,
            `footprint_${footprintIndex + 1}`
        )
        const componentIndex = `library_footprint_${footprintKey}`
        const pcbComponentId = Primitives.id(idScope, [
            'pcb_component',
            componentIndex
        ])
        const sourceNetIds = new Map()
        const ownerComponentIds = new Map([
            [String(rawFootprint.id || ''), pcbComponentId],
            [String(rawFootprint.reference || ''), pcbComponentId],
            [String(footprintKey), pcbComponentId]
        ])

        CircuitJsonPcbLibraryBuilder.#appendPcbComponent(
            circuitJson,
            rawFootprint,
            sourceComponentId,
            pcbComponentId
        )

        for (const [padIndex, pad] of Primitives.array(
            footprint.pads || rawFootprint.pads
        ).entries()) {
            CircuitJsonPcbLibraryBuilder.#appendPad(
                circuitJson,
                idScope,
                CircuitJsonPcbLibraryBuilder.#pad(pad, componentIndex),
                padIndex,
                sourceComponentId,
                pcbComponentId,
                sourceNetIds
            )
        }

        CircuitJsonPcbTextBuilder.append(
            circuitJson,
            idScope,
            Primitives.array(footprint.texts || rawFootprint.texts).map(
                (text) => CircuitJsonPcbLibraryBuilder.#text(text)
            ),
            { ownerComponentIds }
        )
        CircuitJsonPcbArtworkBuilder.append(
            circuitJson,
            idScope,
            footprint.drawings || rawFootprint.drawings,
            {
                coordinateUnits: 'mm',
                ownerComponentIds,
                idParts: ['library_footprint', footprintIndex]
            }
        )
    }

    /**
     * Appends the PCB component row for one footprint.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {Record<string, unknown>} rawFootprint Parsed footprint.
     * @param {string} sourceComponentId Source component id.
     * @param {string} pcbComponentId PCB component id.
     * @returns {void}
     */
    static #appendPcbComponent(
        circuitJson,
        rawFootprint,
        sourceComponentId,
        pcbComponentId
    ) {
        circuitJson.push({
            type: 'pcb_component',
            pcb_component_id: pcbComponentId,
            source_component_id: sourceComponentId,
            center: { x: 0, y: 0 },
            layer: Primitives.side(rawFootprint.layer),
            rotation: Primitives.normalizedRotation(rawFootprint.rotation),
            width: CircuitJsonPcbLibraryBuilder.#millimeterLength(
                rawFootprint.bounds?.width
            ),
            height: CircuitJsonPcbLibraryBuilder.#millimeterLength(
                rawFootprint.bounds?.height
            )
        })
    }

    /**
     * Appends one footprint pad and its port/hole projection.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} pad Normalized pad row.
     * @param {number} padIndex Pad index.
     * @param {string} sourceComponentId Source component id.
     * @param {string} pcbComponentId PCB component id.
     * @param {Map<string, string>} sourceNetIds Source net lookup.
     * @returns {void}
     */
    static #appendPad(
        circuitJson,
        idScope,
        pad,
        padIndex,
        sourceComponentId,
        pcbComponentId,
        sourceNetIds
    ) {
        const rawPortHint = Primitives.string(
            pad.name || pad.pinName || pad.pinNumber || pad.number,
            String(padIndex + 1)
        )
        const portHint = Primitives.sourcePortName(rawPortHint)
        const portHints = Primitives.sourcePortHints(portHint, rawPortHint)
        const sourcePortId = Primitives.sourcePortId(
            idScope,
            pad,
            padIndex,
            sourceComponentId
        )
        const pcbPortId = Primitives.id(idScope, ['pcb_port', sourcePortId])
        const center = Primitives.milPoint(pad.x, pad.y)
        const layers = Primitives.layers(pad)
        const sourcePort = {
            type: 'source_port',
            source_port_id: sourcePortId,
            source_component_id: sourceComponentId,
            name: portHint,
            port_hints: portHints
        }
        const pinNumber = Primitives.pinNumber(rawPortHint)

        Elements.sourceNetIdForPrimitive(
            circuitJson,
            idScope,
            pad,
            sourceNetIds
        )
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
            return
        }

        CircuitJsonPcbLibraryBuilder.#appendSmtPad(
            circuitJson,
            idScope,
            pad,
            sourcePortId,
            pcbComponentId,
            pcbPortId,
            portHints
        )
    }

    /**
     * Appends one SMT pad projection.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} pad Normalized pad row.
     * @param {string} sourcePortId Source port id.
     * @param {string} pcbComponentId PCB component id.
     * @param {string} pcbPortId PCB port id.
     * @param {string[]} portHints Port hints.
     * @returns {void}
     */
    static #appendSmtPad(
        circuitJson,
        idScope,
        pad,
        sourcePortId,
        pcbComponentId,
        pcbPortId,
        portHints
    ) {
        const center = Primitives.milPoint(pad.x, pad.y)
        const smtPad = {
            type: 'pcb_smtpad',
            pcb_smtpad_id: Primitives.id(idScope, ['pcb_smtpad', sourcePortId]),
            pcb_component_id: pcbComponentId,
            pcb_port_id: pcbPortId,
            x: center.x,
            y: center.y,
            layer: Primitives.layerName(pad),
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
            if (geometry.cornerRadius)
                smtPad.corner_radius = geometry.cornerRadius
            if (smtPad.shape === 'pill') smtPad.radius = geometry.radius
            if (geometry.rotation) {
                smtPad.shape =
                    smtPad.shape === 'pill' ? 'rotated_pill' : 'rotated_rect'
                smtPad.ccw_rotation = geometry.rotation
            }
        }

        circuitJson.push(smtPad)
    }

    /**
     * Normalizes a standalone footprint pad for shared PCB primitives.
     * @param {Record<string, unknown>} pad Parsed footprint pad.
     * @param {string} componentIndex Synthetic component key.
     * @returns {object}
     */
    static #pad(pad, componentIndex) {
        const drillWidth = Primitives.number(pad.drillWidth, 0) || 0
        const drillHeight = Primitives.number(pad.drillHeight, 0) || 0
        const drillMinorDimension =
            drillWidth > 0 && drillHeight > 0
                ? Math.min(drillWidth, drillHeight)
                : 0

        return {
            ...pad,
            componentIndex,
            name: pad.name || pad.number || pad.pinName || pad.pinNumber,
            x: CircuitJsonPcbLibraryBuilder.#millimeterToMil(pad.x),
            y: CircuitJsonPcbLibraryBuilder.#millimeterToMil(pad.y),
            sizeTopX: CircuitJsonPcbLibraryBuilder.#millimeterToMil(
                pad.sizeTopX || pad.sizeX || pad.width
            ),
            sizeTopY: CircuitJsonPcbLibraryBuilder.#millimeterToMil(
                pad.sizeTopY || pad.sizeY || pad.height
            ),
            holeDiameter: CircuitJsonPcbLibraryBuilder.#millimeterToMil(
                pad.holeDiameter ||
                    drillMinorDimension ||
                    pad.drill ||
                    pad.drillDiameter
            ),
            holeSlotLength: CircuitJsonPcbLibraryBuilder.#millimeterToMil(
                pad.holeSlotLength ||
                    pad.slotLength ||
                    Math.max(drillWidth, drillHeight)
            ),
            shapeTopName: pad.shapeTopName || pad.shapeName || pad.shape,
            layer: CircuitJsonPcbLibraryBuilder.#primaryPadLayer(pad),
            rotation: pad.rotation,
            isPlated: pad.isPlated !== false && pad.type !== 'np_thru_hole',
            netName: pad.netName || pad.net || ''
        }
    }

    /**
     * Normalizes a standalone footprint text row for the PCB text builder.
     * @param {Record<string, unknown>} text Parsed footprint text.
     * @returns {object}
     */
    static #text(text) {
        return {
            ...text,
            x: CircuitJsonPcbLibraryBuilder.#millimeterToMil(text.x),
            y: CircuitJsonPcbLibraryBuilder.#millimeterToMil(text.y),
            text: text.text || text.value,
            value: text.value || text.text
        }
    }

    /**
     * Returns the primary copper layer for a footprint pad.
     * @param {Record<string, unknown>} pad Parsed footprint pad.
     * @returns {string}
     */
    static #primaryPadLayer(pad) {
        const layers = Primitives.array(pad.layers)
        const copperLayer =
            layers.find((layer) => {
                return String(layer || '').endsWith('.Cu')
            }) || layers[0]

        return String(copperLayer || pad.layer || pad.layerName || 'F.Cu')
    }

    /**
     * Converts millimeters to mils for shared PCB builders.
     * @param {unknown} value Millimeter value.
     * @returns {number}
     */
    static #millimeterToMil(value) {
        return (Primitives.number(value, 0) || 0) * (1000 / 25.4)
    }

    /**
     * Returns a rounded millimeter length.
     * @param {unknown} value Millimeter value.
     * @returns {number}
     */
    static #millimeterLength(value) {
        return Primitives.round(Primitives.number(value, 0) || 0)
    }
}
