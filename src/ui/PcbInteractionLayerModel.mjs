// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { PcbInteractionIndex } from './PcbInteractionIndex.mjs'

const VIRTUAL_LAYER_DEFINITIONS = [
    { key: 'tracks', label: 'Tracks' },
    { key: 'vias', label: 'Vias' },
    { key: 'pads', label: 'Pads' },
    { key: 'holes', label: 'Holes' },
    { key: 'zones', label: 'Zones' },
    { key: 'footprint-text', label: 'Footprint text' }
]

/**
 * Builds a PCB layer summary with physical layers and virtual controls.
 */
export class PcbInteractionLayerModel {
    /**
     * Resolves physical and virtual interaction layers.
     * @param {object} boardOrDocument Toolkit board or wrapped document model.
     * @returns {{ physicalLayers: object[], virtualLayers: object[] }}
     */
    static resolve(boardOrDocument) {
        const board = PcbInteractionIndex.resolveBoardModel(boardOrDocument)
        const physicalLayers = PcbInteractionLayerModel.#physicalLayers(board)
        const items = PcbInteractionIndex.build(boardOrDocument)
        const layersByObject = PcbInteractionLayerModel.#layersByObject(items)

        return {
            physicalLayers,
            virtualLayers: VIRTUAL_LAYER_DEFINITIONS.map((definition) => ({
                ...definition,
                physicalLayerKeys: Array.from(
                    layersByObject.get(definition.key) || []
                )
            }))
        }
    }

    /**
     * Resolves physical layers from board metadata.
     * @param {object | null} board Board model.
     * @returns {object[]}
     */
    static #physicalLayers(board) {
        const seen = new Set()
        const layers = []

        for (const layer of Array.isArray(board?.layers) ? board.layers : []) {
            const key = String(layer?.name || layer?.canonicalName || '').trim()
            if (!key || seen.has(key)) continue
            seen.add(key)
            layers.push({
                key,
                label: key,
                type: String(layer?.type || '')
            })
        }

        return layers
    }

    /**
     * Collects referenced physical layer keys by virtual object key.
     * @param {object[]} items Interaction items.
     * @returns {Map<string, Set<string>>}
     */
    static #layersByObject(items) {
        const layersByObject = new Map()

        for (const item of items) {
            if (!layersByObject.has(item.objectKey)) {
                layersByObject.set(item.objectKey, new Set())
            }
            const layerSet = layersByObject.get(item.objectKey)
            for (const layerKey of item.layerKeys || []) {
                layerSet.add(layerKey)
            }
            if (item.type === 'pad' || item.type === 'via') {
                if (!layersByObject.has('holes')) {
                    layersByObject.set('holes', new Set())
                }
                for (const layerKey of item.layerKeys || []) {
                    layersByObject.get('holes').add(layerKey)
                }
            }
        }

        return layersByObject
    }
}
