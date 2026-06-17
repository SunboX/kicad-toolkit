// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadLayerResolver } from './KicadLayerResolver.mjs'

const knownPadShapes = new Set([
    'circle',
    'custom',
    'oval',
    'rect',
    'roundrect',
    'trapezoid'
])
const knownPadTypes = new Set(['smd', 'thru_hole', 'np_thru_hole', 'connect'])

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
        const diagnostics = keyedDiagnostics(
            footprints.flatMap((footprint, footprintIndex) =>
                footprint.diagnostics.map((diagnostic) => ({
                    ...diagnostic,
                    footprintIndex,
                    footprintName: footprint.name
                }))
            )
        )

        return {
            schema: KicadFootprintLibraryParityReportBuilder.SCHEMA,
            summary: summary(footprints, diagnostics),
            footprints,
            diagnostics,
            indexes: {
                diagnosticsByCode: keysBy(diagnostics, 'code')
            }
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
        diagnostics: [
            ...advancedFieldDiagnostics(advancedFields),
            ...fidelityDiagnostics(footprint)
        ]
    }
}

/**
 * Builds top-level parity counters.
 * @param {object[]} footprints Footprint parity rows.
 * @param {object[]} diagnostics Diagnostic rows.
 * @returns {object}
 */
function summary(footprints, diagnostics) {
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
        privateGraphicCount: sum(footprints, 'privateGraphics'),
        diagnosticCount: diagnostics.length,
        unknownLayerCount: diagnostics.filter(
            (diagnostic) =>
                diagnostic.code ===
                'kicad.footprint-library.fidelity.unknown-layer'
        ).length,
        unknownPadShapeCount: diagnostics.filter(
            (diagnostic) =>
                diagnostic.code ===
                'kicad.footprint-library.fidelity.unknown-pad-shape'
        ).length,
        unknownPadTypeCount: diagnostics.filter(
            (diagnostic) =>
                diagnostic.code ===
                'kicad.footprint-library.fidelity.unknown-pad-type'
        ).length,
        padDrillTypeMismatchCount: diagnostics.filter(
            (diagnostic) =>
                diagnostic.code ===
                'kicad.footprint-library.fidelity.pad-drill-type-mismatch'
        ).length
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
function advancedFieldDiagnostics(advancedFields) {
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
 * Builds footprint-local fidelity diagnostics.
 * @param {object} footprint Footprint record.
 * @returns {object[]}
 */
function fidelityDiagnostics(footprint) {
    return [
        ...unknownLayerDiagnostics(footprint),
        ...unknownPadShapeDiagnostics(footprint),
        ...unknownPadTypeDiagnostics(footprint),
        ...padDrillTypeMismatchDiagnostics(footprint)
    ]
}

/**
 * Builds diagnostics for unknown footprint layers.
 * @param {object} footprint Footprint record.
 * @returns {object[]}
 */
function unknownLayerDiagnostics(footprint) {
    const diagnostics = []
    const seen = new Set()

    for (const primitive of primitives(footprint)) {
        for (const layer of layerNames(primitive)) {
            const metadata = KicadLayerResolver.metadataForLayer(layer)
            if (metadata.isKnownStandard) continue
            const key = `${layer}:${primitiveKey(primitive)}`
            if (seen.has(key)) continue
            seen.add(key)
            diagnostics.push({
                code: 'kicad.footprint-library.fidelity.unknown-layer',
                severity: 'warning',
                layer,
                primitiveKey: primitiveKey(primitive),
                message:
                    'KiCad footprint primitive references a layer that is not a known standard layer.'
            })
        }
    }

    return diagnostics
}

/**
 * Builds diagnostics for unknown pad shapes.
 * @param {object} footprint Footprint record.
 * @returns {object[]}
 */
function unknownPadShapeDiagnostics(footprint) {
    return (footprint.pads || [])
        .filter((pad) => {
            const shape = String(pad?.shape || '').trim()
            return shape && !knownPadShapes.has(shape)
        })
        .map((pad) => ({
            code: 'kicad.footprint-library.fidelity.unknown-pad-shape',
            severity: 'warning',
            padNumber: String(pad?.number || pad?.name || ''),
            shape: String(pad?.shape || ''),
            message:
                'KiCad footprint pad uses a shape outside the known standard pad shape set.'
        }))
}

/**
 * Builds diagnostics for unknown pad types.
 * @param {object} footprint Footprint record.
 * @returns {object[]}
 */
function unknownPadTypeDiagnostics(footprint) {
    return (footprint.pads || [])
        .filter((pad) => {
            const type = String(pad?.type || '').trim()
            return type && !knownPadTypes.has(type)
        })
        .map((pad) => ({
            code: 'kicad.footprint-library.fidelity.unknown-pad-type',
            severity: 'warning',
            padNumber: String(pad?.number || pad?.name || ''),
            padType: String(pad?.type || ''),
            message:
                'KiCad footprint pad uses a type outside the known standard pad type set.'
        }))
}

/**
 * Builds diagnostics for pad type and drill inconsistencies.
 * @param {object} footprint Footprint record.
 * @returns {object[]}
 */
function padDrillTypeMismatchDiagnostics(footprint) {
    return (footprint.pads || [])
        .filter(hasPadDrillTypeMismatch)
        .map((pad) => ({
            code: 'kicad.footprint-library.fidelity.pad-drill-type-mismatch',
            severity: 'warning',
            padNumber: String(pad?.number || pad?.name || ''),
            padType: String(pad?.type || ''),
            drill: padDrillDiameter(pad),
            message:
                'KiCad footprint pad drill metadata does not match its pad type.'
        }))
}

/**
 * Returns true when pad type and drill fields disagree.
 * @param {object} pad Pad record.
 * @returns {boolean}
 */
function hasPadDrillTypeMismatch(pad) {
    const type = String(pad?.type || '')
    const drill = padDrillDiameter(pad)
    if (type === 'smd' || type === 'connect') return drill > 0
    if (type === 'thru_hole' || type === 'np_thru_hole') return drill <= 0
    return false
}

/**
 * Returns a representative drill diameter for one pad.
 * @param {object} pad Pad record.
 * @returns {number}
 */
function padDrillDiameter(pad) {
    return Math.max(
        0,
        Number(pad?.drill || 0),
        Number(pad?.drillWidth || 0),
        Number(pad?.drillHeight || 0),
        Number(pad?.holeDiameter || 0)
    )
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
 * Returns all layer names attached to a primitive.
 * @param {object} primitive Primitive row.
 * @returns {string[]}
 */
function layerNames(primitive) {
    return layerDescriptors(primitive).map((layer) => layer.layerKey)
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
 * Returns a stable primitive key for diagnostics.
 * @param {object} primitive Primitive row.
 * @returns {string}
 */
function primitiveKey(primitive) {
    return String(
        primitive?.id ||
            primitive?.key ||
            primitive?.number ||
            primitive?.name ||
            primitive?.type ||
            ''
    )
}

/**
 * Adds stable keys to diagnostics.
 * @param {object[]} diagnostics Diagnostic rows.
 * @returns {object[]}
 */
function keyedDiagnostics(diagnostics) {
    return diagnostics.map((diagnostic, index) => ({
        key: 'footprint-fidelity-' + index,
        ...diagnostic
    }))
}

/**
 * Groups row keys by one field.
 * @param {object[]} rows Rows.
 * @param {string} field Field name.
 * @returns {Record<string, string[]>}
 */
function keysBy(rows, field) {
    const groups = {}
    for (const row of rows) {
        const key = String(row[field] || '')
        if (!key) continue
        groups[key] ||= []
        groups[key].push(row.key)
    }
    return Object.fromEntries(Object.entries(groups).sort())
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
