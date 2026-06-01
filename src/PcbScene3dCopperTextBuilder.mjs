// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { PcbScene3dLayerMapper } from './PcbScene3dLayerMapper.mjs'

/**
 * Builds copper-layer text detail for data-only KiCad 3D scene descriptions.
 */
export class PcbScene3dCopperTextBuilder {
    /**
     * Builds copper text primitives from the highest-fidelity source.
     * @param {object} documentModel Source document model.
     * @param {{ centerY: number } | null} [board] Scene board metadata.
     * @returns {object[]}
     */
    static build(documentModel, board = null) {
        const source =
            PcbScene3dCopperTextBuilder.#resolveKicadTextSource(documentModel)

        return source.texts
            .map((text) =>
                PcbScene3dCopperTextBuilder.#buildCopperText(text, source.units)
            )
            .map((text) =>
                text && board ? PcbScene3dLayerMapper.text(text, board) : text
            )
            .filter(Boolean)
    }

    /**
     * Resolves the highest-fidelity KiCad text source and coordinate unit.
     * @param {object} documentModel Source document model.
     * @returns {{ texts: object[], units: 'mm' | 'mil' }}
     */
    static #resolveKicadTextSource(documentModel) {
        const rawTexts = documentModel?.pcb?.kicadBoard?.texts
        if (Array.isArray(rawTexts) && rawTexts.length) {
            return { texts: rawTexts, units: 'mm' }
        }

        return {
            texts: Array.isArray(documentModel?.pcb?.texts)
                ? documentModel.pcb.texts
                : [],
            units: 'mil'
        }
    }

    /**
     * Builds one normalized copper text primitive.
     * @param {object} text Source text primitive.
     * @param {'mm' | 'mil'} units Source coordinate units.
     * @returns {object | null}
     */
    static #buildCopperText(text, units) {
        const layerInfo =
            PcbScene3dCopperTextBuilder.#resolveCopperTextLayer(text)
        if (!layerInfo || text?.visible === false) {
            return null
        }

        return {
            x: PcbScene3dCopperTextBuilder.#toTextMil(text?.x, units),
            y: PcbScene3dCopperTextBuilder.#toTextMil(text?.y, units),
            value: String(text?.value ?? text?.text ?? ''),
            layer: layerInfo.layer,
            side: layerInfo.side,
            layerId: layerInfo.layerId,
            rotation: Number(text?.rotation || 0),
            mirrored: Boolean(text?.mirrored),
            hAlign: String(text?.hAlign || 'center'),
            vAlign: String(text?.vAlign || 'center'),
            sizeX: PcbScene3dCopperTextBuilder.#toTextMetricMil(
                text?.sizeX,
                text?.sizeY,
                1,
                units
            ),
            sizeY: PcbScene3dCopperTextBuilder.#toTextMetricMil(
                text?.sizeY,
                text?.sizeX,
                1,
                units
            ),
            thickness: PcbScene3dCopperTextBuilder.#toTextMetricMil(
                text?.thickness,
                undefined,
                0.12,
                units
            )
        }
    }

    /**
     * Resolves a KiCad copper text layer.
     * @param {object} text Source text primitive.
     * @returns {{ layer: string, side: 'front' | 'back', layerId: number } | null}
     */
    static #resolveCopperTextLayer(text) {
        const layer = String(text?.layer || '').toUpperCase()

        if (layer === 'F.CU') {
            return { layer: 'F.Cu', side: 'front', layerId: 1 }
        }

        if (layer === 'B.CU') {
            return { layer: 'B.Cu', side: 'back', layerId: 32 }
        }

        return null
    }

    /**
     * Converts a coordinate value to mils according to source units.
     * @param {number | string | undefined} value Source value.
     * @param {'mm' | 'mil'} units Source units.
     * @returns {number}
     */
    static #toTextMil(value, units) {
        return units === 'mm'
            ? PcbScene3dCopperTextBuilder.#toMil(value)
            : Number(value || 0)
    }

    /**
     * Converts a text metric to mils with fallback handling.
     * @param {number | string | undefined} primary Primary source value.
     * @param {number | string | undefined} secondary Secondary source value.
     * @param {number} fallbackMm Fallback in millimeters.
     * @param {'mm' | 'mil'} units Source units.
     * @returns {number}
     */
    static #toTextMetricMil(primary, secondary, fallbackMm, units) {
        const value = Number(primary ?? secondary)
        if (Number.isFinite(value) && value > 0) {
            return units === 'mm'
                ? PcbScene3dCopperTextBuilder.#toMil(value)
                : value
        }

        return PcbScene3dCopperTextBuilder.#toMil(fallbackMm)
    }

    /**
     * Converts millimeters to mils.
     * @param {number | string | undefined} value Millimeter value.
     * @returns {number}
     */
    static #toMil(value) {
        return (Number(value || 0) * 1000) / 25.4
    }
}
