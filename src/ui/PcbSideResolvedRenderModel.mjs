// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Prepares normalized KiCad PCB models for side-specific top-oriented renderers.
 */
export class PcbSideResolvedRenderModel {
    /**
     * Resolves a normalized PCB model for the requested board side.
     * @param {object | null} board Board or parser root model.
     * @param {'front' | 'back' | { side?: 'front' | 'back' }} [options] Side options.
     * @returns {object | null}
     */
    static resolve(board, options = {}) {
        if (!board) return null

        const side = PcbSideResolvedRenderModel.#normalizeSide(options)
        if (board?.pcb) {
            return PcbSideResolvedRenderModel.#resolveDocumentModel(board, side)
        }

        return PcbSideResolvedRenderModel.#resolveKicadBoard(board, side)
    }

    /**
     * Checks whether a primitive belongs to a KiCad copper layer.
     * @param {object | null} primitive Primitive model.
     * @returns {boolean}
     */
    static isCopperPrimitive(primitive) {
        const layerId = Number(primitive?.layerId)
        if (Number.isInteger(layerId) && (layerId === 1 || layerId === 32)) {
            return true
        }

        return PcbSideResolvedRenderModel.#layerNames(primitive).some((layer) =>
            /^(?:F|B|In\d+)\.Cu$/iu.test(layer)
        )
    }

    /**
     * Resolves a parser root model for one board side.
     * @param {object} documentModel Parser root model.
     * @param {'front' | 'back'} side Requested side.
     * @returns {object}
     */
    static #resolveDocumentModel(documentModel, side) {
        const pcb = documentModel.pcb || {}

        return {
            ...documentModel,
            renderSide: side,
            pcb: {
                ...pcb,
                components: PcbSideResolvedRenderModel.#filterListBySide(
                    pcb.components,
                    side
                ),
                polygons: PcbSideResolvedRenderModel.#filterListBySide(
                    pcb.polygons,
                    side
                ),
                fills: PcbSideResolvedRenderModel.#filterListBySide(
                    pcb.fills,
                    side
                ),
                tracks: PcbSideResolvedRenderModel.#filterListBySide(
                    pcb.tracks,
                    side
                ),
                arcs: PcbSideResolvedRenderModel.#filterListBySide(
                    pcb.arcs,
                    side
                ),
                regions: PcbSideResolvedRenderModel.#filterListBySide(
                    pcb.regions,
                    side
                ),
                shapeBasedRegions: PcbSideResolvedRenderModel.#filterListBySide(
                    pcb.shapeBasedRegions,
                    side
                ),
                boardRegions: PcbSideResolvedRenderModel.#filterListBySide(
                    pcb.boardRegions,
                    side
                ),
                vias: PcbSideResolvedRenderModel.#copyList(pcb.vias),
                pads: PcbSideResolvedRenderModel.#filterListBySide(
                    pcb.pads,
                    side
                ),
                texts: PcbSideResolvedRenderModel.#filterListBySide(
                    pcb.texts,
                    side
                ),
                kicadBoard: pcb.kicadBoard
                    ? PcbSideResolvedRenderModel.#resolveKicadBoard(
                          pcb.kicadBoard,
                          side
                      )
                    : pcb.kicadBoard
            }
        }
    }

    /**
     * Resolves a raw KiCad board model for one board side.
     * @param {object} board Raw KiCad board model.
     * @param {'front' | 'back'} side Requested side.
     * @returns {object}
     */
    static #resolveKicadBoard(board, side) {
        return {
            ...board,
            renderSide: side,
            outlines: PcbSideResolvedRenderModel.#copyList(board.outlines),
            footprints: PcbSideResolvedRenderModel.#filterListBySide(
                board.footprints,
                side
            ),
            pads: PcbSideResolvedRenderModel.#filterListBySide(
                board.pads,
                side
            ),
            drawings: PcbSideResolvedRenderModel.#filterListBySide(
                board.drawings,
                side
            ),
            texts: PcbSideResolvedRenderModel.#filterListBySide(
                board.texts,
                side
            )
        }
    }

    /**
     * Normalizes the caller side option.
     * @param {'front' | 'back' | { side?: 'front' | 'back' }} options Options.
     * @returns {'front' | 'back'}
     */
    static #normalizeSide(options) {
        if (options === 'back') return 'back'
        if (options && typeof options === 'object' && options.side === 'back') {
            return 'back'
        }
        return 'front'
    }

    /**
     * Filters an optional list by requested side.
     * @param {readonly object[] | undefined} items Source items.
     * @param {'front' | 'back'} side Requested side.
     * @returns {object[]}
     */
    static #filterListBySide(items, side) {
        return (Array.isArray(items) ? items : [])
            .filter((item) =>
                PcbSideResolvedRenderModel.#isVisibleOnSide(item, side)
            )
            .map((item) => ({ ...item }))
    }

    /**
     * Copies an optional list.
     * @param {readonly object[] | undefined} items Source items.
     * @returns {object[]}
     */
    static #copyList(items) {
        return (Array.isArray(items) ? items : []).map((item) => ({ ...item }))
    }

    /**
     * Checks whether an item is visible from one board side.
     * @param {object | null} item Item model.
     * @param {'front' | 'back'} side Requested side.
     * @returns {boolean}
     */
    static #isVisibleOnSide(item, side) {
        const itemSide = PcbSideResolvedRenderModel.#sideFromItem(item)
        if (itemSide === 'both') return true
        return itemSide === side
    }

    /**
     * Resolves one item side from normalized side, layer id, or layer names.
     * @param {object | null} item Item model.
     * @returns {'front' | 'back' | 'both'}
     */
    static #sideFromItem(item) {
        const side = String(item?.side || '')
            .trim()
            .toLowerCase()
        if (side === 'front' || side === 'back' || side === 'both') {
            return side
        }

        const layerId = Number(item?.layerId ?? item?.legacyLayerId)
        if (Number.isInteger(layerId)) {
            if (layerId === 1) return 'front'
            if (layerId === 32) return 'back'
        }

        const layers = PcbSideResolvedRenderModel.#layerNames(item)
        const hasFront = layers.some((layer) => /^(?:F\.|TOP\b)/iu.test(layer))
        const hasBack = layers.some((layer) =>
            /^(?:B\.|BOTTOM\b|BOT\b)/iu.test(layer)
        )

        if (hasFront && hasBack) return 'both'
        if (hasBack) return 'back'
        return 'front'
    }

    /**
     * Resolves layer names from an item.
     * @param {object | null} item Item model.
     * @returns {string[]}
     */
    static #layerNames(item) {
        const layerValues = [
            item?.layer,
            item?.layerName,
            ...(Array.isArray(item?.layers) ? item.layers : [])
        ]

        return layerValues
            .flatMap((value) => String(value || '').split(','))
            .map((layer) => layer.trim())
            .filter(Boolean)
    }
}

/**
 * Resolves a normalized PCB model for the requested board side.
 * @param {object | null} board Board or parser root model.
 * @param {'front' | 'back' | { side?: 'front' | 'back' }} [options] Side options.
 * @returns {object | null}
 */
export function preparePcbSideResolvedRenderModel(board, options = {}) {
    return PcbSideResolvedRenderModel.resolve(board, options)
}

/**
 * Checks whether a primitive belongs to a KiCad copper layer.
 * @param {object | null} primitive Primitive model.
 * @returns {boolean}
 */
export function isCopperPrimitive(primitive) {
    return PcbSideResolvedRenderModel.isCopperPrimitive(primitive)
}
