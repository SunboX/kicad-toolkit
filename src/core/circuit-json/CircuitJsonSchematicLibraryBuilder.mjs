// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonModelAdapterPrimitives } from './CircuitJsonModelAdapterPrimitives.mjs'
import { CircuitJsonSchematicSymbolPreviewBuilder } from './CircuitJsonSchematicSymbolPreviewBuilder.mjs'
import { CircuitJsonSourceComponentFtype } from './CircuitJsonSourceComponentFtype.mjs'
import { CircuitJsonSourceComponentMetadata } from './CircuitJsonSourceComponentMetadata.mjs'

const Primitives = CircuitJsonModelAdapterPrimitives

/**
 * Appends Circuit JSON elements for schematic symbol-library models.
 */
export class CircuitJsonSchematicLibraryBuilder {
    /**
     * Appends source and preview elements for a schematic symbol library.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {Record<string, unknown>} model Renderer model.
     * @param {string} idScope Deterministic id scope.
     * @returns {void}
     */
    static append(circuitJson, model, idScope) {
        for (const [symbolIndex, symbol] of Primitives.array(
            model.schematicLibrary?.symbols
        ).entries()) {
            const sourceComponentId = Primitives.id(idScope, [
                'library_symbol',
                symbol.name || symbol.itemName || symbolIndex
            ])
            circuitJson.push({
                type: 'source_component',
                source_component_id: sourceComponentId,
                name: Primitives.string(
                    symbol.name || symbol.itemName,
                    `SYMBOL_${symbolIndex + 1}`
                ),
                ftype: CircuitJsonSourceComponentFtype.infer(symbol),
                ...CircuitJsonSourceComponentMetadata.fields(symbol)
            })

            const sourcePortIdsByPinNumber = new Map()
            for (const [pinIndex, pin] of Primitives.array(
                symbol.pins
            ).entries()) {
                const sourcePortId = Primitives.id(idScope, [
                    'library_symbol_port',
                    symbol.name || symbol.itemName || symbolIndex,
                    pin.number || pin.name || pinIndex
                ])
                sourcePortIdsByPinNumber.set(
                    String(pin.number || pinIndex + 1),
                    sourcePortId
                )
                circuitJson.push({
                    type: 'source_port',
                    source_port_id: sourcePortId,
                    source_component_id: sourceComponentId,
                    name: Primitives.string(
                        pin.name || pin.number,
                        String(pinIndex + 1)
                    ),
                    pin_number:
                        Primitives.pinNumber(pin.number || pin.name) ??
                        pinIndex + 1
                })
            }

            CircuitJsonSchematicSymbolPreviewBuilder.append(
                circuitJson,
                idScope,
                symbol,
                symbolIndex,
                sourceComponentId,
                sourcePortIdsByPinNumber
            )
        }
    }
}
