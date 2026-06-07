// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Builds parity reports for advanced KiCad footprint-library fields.
 */
export class KicadFootprintLibraryParityReportBuilder {
    static SCHEMA = 'kicad-toolkit.footprint-library.parity.a1'

    /**
     * Builds an advanced-field parity report.
     * @param {{ footprints?: object[] }} pcbLibrary Parsed footprint library model.
     * @returns {object}
     */
    static build(pcbLibrary = {}) {
        const footprints = (pcbLibrary.footprints || []).map((footprint) =>
            footprintRow(footprint)
        )

        return {
            schema: KicadFootprintLibraryParityReportBuilder.SCHEMA,
            summary: summary(footprints),
            footprints
        }
    }
}

/**
 * Builds one footprint parity row.
 * @param {object} footprint Footprint record.
 * @returns {object}
 */
function footprintRow(footprint) {
    const advancedFields = {
        customPadPrimitives: customPadPrimitiveCount(footprint),
        padLayerSets: padLayerSetCount(footprint),
        padOptions: padOptionCount(footprint),
        drilledPads: drilledPadCount(footprint),
        modelReferences: (footprint.models || []).length,
        imageGraphics: drawingCount(footprint, 'image'),
        barcodeGraphics: drawingCount(footprint, 'barcode'),
        privateGraphics: privateGraphicCount(footprint)
    }

    return {
        name: footprint.name || footprint.footprintName || '',
        advancedFields,
        layers: layers(footprint),
        diagnostics: diagnostics(advancedFields)
    }
}

/**
 * Builds top-level parity counters.
 * @param {object[]} footprints Footprint parity rows.
 * @returns {object}
 */
function summary(footprints) {
    return {
        footprintCount: footprints.length,
        footprintWithAdvancedFieldsCount: footprints.filter((footprint) =>
            hasAdvancedFields(footprint.advancedFields)
        ).length,
        customPadPrimitiveCount: sum(footprints, 'customPadPrimitives'),
        padLayerSetCount: sum(footprints, 'padLayerSets'),
        padOptionCount: sum(footprints, 'padOptions'),
        drilledPadCount: sum(footprints, 'drilledPads'),
        modelReferenceFootprintCount: footprints.filter(
            (footprint) => footprint.advancedFields.modelReferences > 0
        ).length,
        imageGraphicCount: sum(footprints, 'imageGraphics'),
        barcodeGraphicCount: sum(footprints, 'barcodeGraphics'),
        privateGraphicCount: sum(footprints, 'privateGraphics')
    }
}

/**
 * Returns whether advanced counters are present.
 * @param {Record<string, number>} advancedFields Advanced field counters.
 * @returns {boolean}
 */
function hasAdvancedFields(advancedFields) {
    return Object.values(advancedFields || {}).some(
        (value) => Number(value) > 0
    )
}

/**
 * Sums one advanced-field counter.
 * @param {object[]} footprints Footprint rows.
 * @param {string} key Advanced-field key.
 * @returns {number}
 */
function sum(footprints, key) {
    return footprints.reduce((total, footprint) => {
        return total + Number(footprint.advancedFields?.[key] || 0)
    }, 0)
}

/**
 * Counts custom pad primitive entries.
 * @param {object} footprint Footprint record.
 * @returns {number}
 */
function customPadPrimitiveCount(footprint) {
    return (footprint.pads || []).reduce((total, pad) => {
        const direct = (pad.customPrimitives || []).length
        const padstack = (pad.padstack?.layers || []).reduce(
            (layerTotal, layer) => {
                return layerTotal + (layer.primitives || []).length
            },
            0
        )
        return total + direct + padstack
    }, 0)
}

/**
 * Counts pads carrying explicit layer sets or padstack layers.
 * @param {object} footprint Footprint record.
 * @returns {number}
 */
function padLayerSetCount(footprint) {
    return (footprint.pads || []).filter((pad) => {
        return (pad.layers || []).length || (pad.padstack?.layers || []).length
    }).length
}

/**
 * Counts pads carrying KiCad pad options.
 * @param {object} footprint Footprint record.
 * @returns {number}
 */
function padOptionCount(footprint) {
    return (footprint.pads || []).filter((pad) => {
        return [
            pad.options,
            pad.tenting,
            pad.zoneConnect,
            pad.clearance,
            pad.solderMaskMargin,
            pad.solderPasteMargin,
            pad.solderPasteMarginRatio,
            pad.thermalBridgeWidth,
            pad.thermalGap
        ].some((value) => value !== undefined && value !== null && value !== '')
    }).length
}

/**
 * Counts pads with drill metadata.
 * @param {object} footprint Footprint record.
 * @returns {number}
 */
function drilledPadCount(footprint) {
    return (footprint.pads || []).filter((pad) => {
        return [
            pad.drill,
            pad.drillWidth,
            pad.drillHeight,
            pad.holeDiameter,
            pad.holeSlotLength
        ].some((value) => Number(value) > 0)
    }).length
}

/**
 * Counts drawing rows by type or source type.
 * @param {object} footprint Footprint record.
 * @param {string} type Drawing type.
 * @returns {number}
 */
function drawingCount(footprint, type) {
    return (footprint.drawings || []).filter((drawing) => {
        return drawing.type === type || drawing.sourceType === type
    }).length
}

/**
 * Counts private or implementation-only graphic rows.
 * @param {object} footprint Footprint record.
 * @returns {number}
 */
function privateGraphicCount(footprint) {
    return (footprint.drawings || []).filter((drawing) => {
        return drawing.private === true || drawing.isPrivate === true
    }).length
}

/**
 * Builds layer descriptors represented by the footprint.
 * @param {object} footprint Footprint record.
 * @returns {object[]}
 */
function layers(footprint) {
    const layerMap = new Map()
    for (const primitive of primitives(footprint)) {
        for (const layer of layerDescriptors(primitive)) {
            layerMap.set(layer.layerKey, layer)
        }
    }
    return [...layerMap.values()].sort((left, right) =>
        localeCompare(left.layerKey, right.layerKey)
    )
}

/**
 * Builds diagnostics for unsupported parity edge cases.
 * @param {object} advancedFields Advanced-field counts.
 * @returns {object[]}
 */
function diagnostics(advancedFields) {
    return hasAdvancedFields(advancedFields)
        ? []
        : [
              {
                  code: 'kicad-footprint-library.parity.no-advanced-fields',
                  severity: 'info',
                  message:
                      'Footprint does not expose advanced KiCad field families.'
              }
          ]
}

/**
 * Returns all footprint primitives with possible layer metadata.
 * @param {object} footprint Footprint record.
 * @returns {object[]}
 */
function primitives(footprint) {
    return [
        ...(footprint.pads || []),
        ...(footprint.drawings || []),
        ...(footprint.texts || [])
    ]
}

/**
 * Builds normalized layer descriptors for one primitive.
 * @param {object} primitive Primitive row.
 * @returns {object[]}
 */
function layerDescriptors(primitive) {
    return [
        ...(Array.isArray(primitive?.layers) ? primitive.layers : []),
        primitive?.layerKey,
        primitive?.layer,
        primitive?.layerName
    ]
        .map((layer) => String(layer || '').trim())
        .filter(Boolean)
        .filter((layer, index, all) => all.indexOf(layer) === index)
        .map((layer) => ({ layerKey: layer, displayName: layer }))
}

/**
 * Compares strings with numeric ordering.
 * @param {string} left Left string.
 * @param {string} right Right string.
 * @returns {number}
 */
function localeCompare(left, right) {
    return String(left).localeCompare(String(right), undefined, {
        numeric: true
    })
}
