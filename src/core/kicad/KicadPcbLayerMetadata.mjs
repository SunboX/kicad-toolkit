// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadLayerResolver } from './KicadLayerResolver.mjs'

/**
 * Builds PCB layer metadata for normalized KiCad board models.
 */
export class KicadPcbLayerMetadata {
    /**
     * Builds renderer-facing document layers.
     * @param {object} board Parsed KiCad board.
     * @param {{ name: string, layerId: number }[]} primitiveLayers Primitive layer metadata.
     * @returns {object[]}
     */
    static documentLayers(board, primitiveLayers) {
        const layerDefinitions = Array.isArray(board.layers) ? board.layers : []
        if (layerDefinitions.length === 0) {
            return primitiveLayers.map((layer, index) => ({
                index,
                ...KicadPcbLayerMetadata.#layerRecord(layer.name)
            }))
        }

        return layerDefinitions.map((layer, index) => ({
            index,
            ordinal: layer.ordinal,
            name: layer.name,
            type: layer.type,
            userName: layer.userName,
            uuid: layer.uuid,
            ...KicadPcbLayerMetadata.#metadataFields(layer.name, {
                includeOrdinal: false
            }),
            layerId: KicadPcbLayerMetadata.layerIdForName(layer.name)
        }))
    }

    /**
     * Builds primitive layer metadata from parsed board content.
     * @param {object} board Board.
     * @returns {{ layerId: number, name: string }[]}
     */
    static primitiveLayers(board) {
        const names = new Set()
        for (const drawing of board.drawings || []) names.add(drawing.layer)
        for (const outline of board.outlines || []) names.add(outline.layer)
        for (const pad of board.pads || []) {
            for (const layer of pad.layers || []) names.add(layer)
        }
        return [...names]
            .filter(Boolean)
            .sort()
            .map((name) => ({
                ...KicadPcbLayerMetadata.#layerRecord(name)
            }))
    }

    /**
     * Resolves a rough layer id from a KiCad layer name.
     * @param {string} layer Layer name.
     * @returns {number}
     */
    static layerIdForName(layer) {
        const metadata = KicadLayerResolver.metadataForLayer(layer)
        if (metadata.ordinal !== null) return metadata.ordinal
        if (metadata.side === 'back') return 32
        return 1
    }

    /**
     * Builds one primitive layer record.
     * @param {string} name Layer name.
     * @returns {object}
     */
    static #layerRecord(name) {
        return {
            name,
            ...KicadPcbLayerMetadata.#metadataFields(name, {
                includeOrdinal: true
            }),
            layerId: KicadPcbLayerMetadata.layerIdForName(name)
        }
    }

    /**
     * Builds normalized metadata fields for a layer record.
     * @param {string} name Layer name.
     * @param {{ includeOrdinal?: boolean }} [options] Options.
     * @returns {object}
     */
    static #metadataFields(name, options = {}) {
        const metadata = KicadLayerResolver.metadataForLayer(name)
        return {
            canonicalName: metadata.name,
            ...(options.includeOrdinal
                ? { ordinal: metadata.ordinal }
                : { standardOrdinal: metadata.ordinal }),
            side: metadata.side,
            layerClass: metadata.layerClass,
            isCopper: metadata.isCopper,
            isTechnical: metadata.isTechnical,
            isWildcard: metadata.isWildcard,
            isKnownStandard: metadata.isKnownStandard
        }
    }
}
