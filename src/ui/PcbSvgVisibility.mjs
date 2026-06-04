// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Resolves KiCad PCB visibility predicates for SVG rendering.
 */
export class PcbSvgVisibility {
    /**
     * Checks whether an item is opposite-side copper for contextual rendering.
     * @param {object} item Renderable item.
     * @param {'front' | 'back'} side Active side.
     * @returns {boolean}
     */
    static isOppositeSideCopper(item, side) {
        if (item.material !== 'copper') return false
        if (!PcbSvgVisibility.isRenderableBoardLayer(item)) return false
        return side === 'front'
            ? PcbSvgVisibility.isVisibleOnSide(item, 'back')
            : PcbSvgVisibility.isVisibleOnSide(item, 'front')
    }

    /**
     * Checks side visibility.
     * @param {{ side: string }} item Renderable item.
     * @param {'front' | 'back'} side Active side.
     * @returns {boolean}
     */
    static isVisibleOnSide(item, side) {
        return item.side === 'both' || item.side === side
    }

    /**
     * Checks KiCad text visibility.
     * @param {{ visible?: boolean }} text Text item.
     * @returns {boolean}
     */
    static isVisibleText(text) {
        return text.visible !== false
    }

    /**
     * Checks whether this is an assembly-excluded footprint reference.
     * @param {{ propertyName?: string, excludeFromPositionFiles?: boolean }} text Text item.
     * @returns {boolean}
     */
    static isExcludedReferenceText(text) {
        return (
            text.excludeFromPositionFiles === true &&
            text.propertyName === 'Reference'
        )
    }

    /**
     * Checks whether a KiCad layer belongs in the visible board render.
     * @param {{ layer?: string }} item Renderable item.
     * @returns {boolean}
     */
    static isRenderableBoardLayer(item) {
        return String(item.layer || '')
            .split(',')
            .some((layer) =>
                PcbSvgVisibility.isRenderableLayerName(layer.trim())
            )
    }

    /**
     * Checks a single KiCad layer name.
     * @param {string} layer Layer name.
     * @returns {boolean}
     */
    static isRenderableLayerName(layer) {
        return (
            layer.endsWith('.Cu') ||
            layer.endsWith('.Mask') ||
            layer.endsWith('.SilkS')
        )
    }
}
