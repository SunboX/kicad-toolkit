// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { strFromU8 } from 'fflate'
import { KicadArcGeometry } from './KicadArcGeometry.mjs'
import { KicadAuxiliaryParserRouter } from './KicadAuxiliaryParserRouter.mjs'
import { KicadBoardOutlineBuilder } from './KicadBoardOutlineBuilder.mjs'
import { KicadFootprintLibraryParser } from './KicadFootprintLibraryParser.mjs'
import { KicadPcbLayerMetadata } from './KicadPcbLayerMetadata.mjs'
import { KicadPcbDocumentSidecarBuilder } from './KicadPcbDocumentSidecarBuilder.mjs'
import { KicadPcbPickPlacePositionResolver } from './KicadPcbPickPlacePositionResolver.mjs'
import { KicadPcbParser } from './KicadPcbParser.mjs'
import { KicadSchematicParser } from './KicadSchematicParser.mjs'
import { KicadSymbolLibraryParser } from './KicadSymbolLibraryParser.mjs'
import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'
import { CircuitJsonModelAdapter } from '../circuit-json/CircuitJsonModelAdapter.mjs'
const milsPerMillimeter = 1000 / 25.4
/**
 * Circuit JSON parser facade for KiCad documents.
 */
export class KicadParser {
    /**
     * Parses a KiCad document buffer into a Circuit JSON element array.
     * @param {string} fileName Source file name.
     * @param {ArrayBuffer | Uint8Array} arrayBuffer Source bytes.
     * @param {object} [options] Parser options.
     * @returns {object[]}
     */
    static parseArrayBuffer(fileName, arrayBuffer, options = {}) {
        return CircuitJsonModelAdapter.fromRendererModel(
            KicadParser.parseArrayBufferToRendererModel(
                fileName,
                arrayBuffer,
                options
            )
        )
    }
    /**
     * Parses a KiCad document buffer into the renderer compatibility model.
     * @param {string} fileName Source file name.
     * @param {ArrayBuffer | Uint8Array} arrayBuffer Source bytes.
     * @param {object} [options] Parser options.
     * @returns {object}
     */
    static parseArrayBufferToRendererModel(
        fileName,
        arrayBuffer,
        options = {}
    ) {
        const normalizedName = String(fileName || 'document')
        const source =
            arrayBuffer instanceof Uint8Array
                ? strFromU8(arrayBuffer)
                : strFromU8(new Uint8Array(arrayBuffer))

        if (/\.kicad_sch$/i.test(normalizedName)) {
            return KicadSchematicParser.parse(source, {
                ...options,
                fileName: normalizedName
            })
        }

        if (/\.kicad_pcb$/i.test(normalizedName)) {
            return KicadParser.wrapBoard(
                KicadPcbParser.parse(source, {
                    ...options,
                    fileName: normalizedName
                }),
                normalizedName
            )
        }

        if (/\.kicad_mod$/i.test(normalizedName)) {
            return KicadFootprintLibraryParser.parse(source, {
                ...options,
                fileName: normalizedName
            })
        }

        if (/\.kicad_sym$/i.test(normalizedName)) {
            return KicadSymbolLibraryParser.parse(source, {
                ...options,
                fileName: normalizedName
            })
        }

        const auxiliaryModel = KicadAuxiliaryParserRouter.parseIfSupported(
            normalizedName,
            source,
            options
        )
        if (auxiliaryModel) return auxiliaryModel

        throw new Error('Unsupported KiCad file type: ' + normalizedName)
    }

    /**
     * Wraps a raw KiCad board in the shared ECAD Forge document shape.
     * @param {object} board Raw KiCad board model.
     * @param {string} fileName Source file name.
     * @returns {object}
     */
    static wrapBoard(board, fileName = '') {
        const nets = board.nets || []
        const components = (board.footprints || []).map((footprint) => {
            const model = primaryFootprintModel(footprint)

            return {
                componentIndex: Number(
                    String(footprint.id || '')
                        .split(':')
                        .at(-1) || 0
                ),
                designator: footprint.reference,
                footprintId: footprint.id,
                x: toMil(footprint.x),
                y: toMil(footprint.y),
                layer: footprint.side === 'back' ? 'BOTTOM' : 'TOP',
                pattern: footprint.libraryName,
                rotation: footprint.rotation,
                source: footprint.libraryName,
                description: footprint.libraryName,
                value: footprint.value || '',
                footprintName: footprint.footprintName || footprint.libraryName,
                properties: footprint.properties || {},
                attributes: footprint.attributes || [],
                excludeFromPositionFiles:
                    footprint.excludeFromPositionFiles === true,
                excludeFromBom: footprint.excludeFromBom === true,
                doNotPopulate: footprint.doNotPopulate === true,
                boardOnly: footprint.boardOnly === true,
                isThroughHole: footprint.isThroughHole === true,
                isSmd: footprint.isSmd === true,
                isVirtual: footprint.isVirtual === true,
                allowMissingCourtyard: footprint.allowMissingCourtyard === true,
                allowSolderMaskBridges:
                    footprint.allowSolderMaskBridges === true,
                ...modelComponentFields(model),
                height: null
            }
        })
        const pads = (board.pads || []).map((pad) =>
            normalizePad(pad, board.footprints)
        )
        const tracks = (board.drawings || [])
            .filter((drawing) => drawing.type === 'segment')
            .map((drawing) => ({
                x1: toMil(drawing.start.x),
                y1: toMil(drawing.start.y),
                x2: toMil(drawing.end.x),
                y2: toMil(drawing.end.y),
                width: toMil(drawing.strokeWidth || 0.2),
                layer: drawing.layer,
                layerCode: 1,
                layerId: KicadPcbLayerMetadata.layerIdForName(drawing.layer),
                ...optionalNetIndex(drawing.netIndex),
                netName: drawing.netName || ''
            }))
        const vias = (board.drawings || [])
            .filter((drawing) => drawing.type === 'via')
            .map((drawing) => ({
                x: toMil(drawing.x),
                y: toMil(drawing.y),
                diameter: toMil(drawing.size),
                holeDiameter: toMil(drawing.drill || 0),
                layer: drawing.layer,
                layers: layerList(drawing.layer),
                ...optionalNetIndex(drawing.netIndex),
                netName: drawing.netName || ''
            }))
        const arcs = (board.drawings || [])
            .filter((drawing) => {
                return drawing.type === 'arc' && drawing.sourceType === 'arc'
            })
            .map((drawing) => {
                const metrics = KicadArcGeometry.fromThreePoints(
                    drawing.start,
                    drawing.mid,
                    drawing.end
                )
                return {
                    x: toMil(metrics?.center.x || 0),
                    y: toMil(metrics?.center.y || 0),
                    radius: toMil(metrics?.radius || 0),
                    startAngle: metrics?.startAngle || 0,
                    endAngle: metrics?.endAngle || 0,
                    sweepAngle: metrics?.sweepAngle || 0,
                    width: toMil(drawing.strokeWidth || 0.2),
                    layer: drawing.layer,
                    componentIndex: null,
                    layerCode: 1,
                    layerId: KicadPcbLayerMetadata.layerIdForName(
                        drawing.layer
                    ),
                    polygonIndex: null,
                    ...optionalNetIndex(drawing.netIndex),
                    netName: drawing.netName || ''
                }
            })
        const polygons = [
            ...board.outlines.map((outline) => ({
                layer: outline.layer || 'Edge.Cuts',
                segments: KicadBoardOutlineBuilder.segmentsFromPoints(
                    outline.points || [],
                    toMil
                )
            })),
            ...(board.drawings || [])
                .filter((drawing) => drawing.type === 'zone')
                .map(zonePolygonFromDrawing)
        ].filter((polygon) => polygon.segments.length > 0)
        const boardOutline = KicadBoardOutlineBuilder.build(board, toMil)
        const bom = groupBoardBomRows(board.footprints || [])
        const primitiveLayers = KicadPcbLayerMetadata.primitiveLayers(board)
        const layerDefinitions = Array.isArray(board.layers) ? board.layers : []
        const documentLayers = KicadPcbLayerMetadata.documentLayers(
            board,
            primitiveLayers
        )
        const classes = board.classes || []
        const rules = board.rules || []
        const statistics = board.statistics || {}
        const pickPlace = KicadPcbPickPlacePositionResolver.buildModel(
            components,
            pads
        )
        const pcb = {
            boardOutline,
            layers: documentLayers,
            layerDefinitions,
            primitiveLayers,
            nets,
            classes,
            rules,
            statistics,
            components,
            pickPlace,
            polygons,
            fills: [],
            tracks,
            arcs,
            vias,
            pads,
            regions: [],
            shapeBasedRegions: [],
            boardRegions: [],
            zoneSemantics: board.zoneSemantics || [],
            texts: (board.texts || []).map(normalizeBoardText),
            embeddedModels: [],
            componentBodies: [],
            componentPrimitiveGroups: [],
            kicadBoard: board
        }
        KicadPcbDocumentSidecarBuilder.attach(pcb, {
            fileName: fileName || board.fileName || ''
        })

        return NormalizedModelSchema.attach({
            sourceFormat: 'kicad',
            kind: 'pcb',
            fileType: 'kicad_pcb',
            fileName: fileName || board.fileName || '',
            summary: {
                title:
                    board.title ||
                    String(fileName || board.fileName || '').replace(
                        /\.[^.]+$/,
                        ''
                    ),
                componentCount: components.length,
                layerCount: documentLayers.length,
                outlineSegmentCount: boardOutline.segments.length,
                bomRowCount: bom.length,
                netCount: nets.length,
                classCount: classes.length,
                ruleCount: rules.length,
                polygonCount: polygons.length,
                trackCount: tracks.length,
                arcCount: arcs.length,
                viaCount: vias.length,
                boardWidthMil: Math.round(boardOutline.widthMil),
                boardHeightMil: Math.round(boardOutline.heightMil)
            },
            diagnostics: [
                {
                    severity: 'info',
                    message:
                        'Recovered ' +
                        components.length +
                        ' KiCad PCB component placements.'
                }
            ],
            pcb,
            pnp: pickPlace,
            bom
        })
    }
}

/**
 * Converts millimeters to mils.
 * @param {number} value Millimeters.
 * @returns {number}
 */
function toMil(value) {
    return Number(value || 0) * milsPerMillimeter
}

/**
 * Splits a comma-separated layer list from a KiCad primitive.
 * @param {unknown} layer Layer text.
 * @returns {string[]}
 */
function layerList(layer) {
    return String(layer || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
}

/**
 * Picks the first visible footprint model.
 * @param {object} footprint Raw KiCad footprint.
 * @returns {object | null}
 */
function primaryFootprintModel(footprint) {
    return (
        (Array.isArray(footprint?.models) ? footprint.models : []).find(
            (model) => model?.visible !== false
        ) || null
    )
}

/**
 * Builds optional component fields from a KiCad footprint model.
 * @param {object | null} model Raw footprint model.
 * @returns {object}
 */
function modelComponentFields(model) {
    if (!model) {
        return {}
    }

    const modelPath = String(model.path || '')
    const offsetMil = {
        x: toMil(model.offset?.x),
        y: toMil(model.offset?.y),
        z: toMil(model.offset?.z)
    }

    return {
        modelName: String(
            model.name || modelPath.replace(/\\/g, '/').split('/').at(-1)
        ),
        modelPath,
        modelTransform: {
            rotationDeg: {
                x: Number(model.rotation?.x || 0),
                y: Number(model.rotation?.y || 0),
                z: Number(model.rotation?.z || 0)
            },
            offsetMil,
            dxMil: offsetMil.x,
            dyMil: offsetMil.y,
            dzMil: offsetMil.z,
            scale: {
                x: Number(model.scale?.x ?? 1),
                y: Number(model.scale?.y ?? 1),
                z: Number(model.scale?.z ?? 1)
            }
        }
    }
}

/**
 * Normalizes a KiCad pad into the Altium-style primitive shape.
 * @param {object} pad KiCad pad.
 * @param {object[]} footprints Board footprints.
 * @returns {object}
 */
function normalizePad(pad, footprints) {
    const layers = padLayerSummary(pad)
    const drill = drillSummary(pad)
    const padProperties = pad.padProperties || []
    const topTenting = firstDefined(
        pad.tenting?.front,
        layers.top.tenting?.front
    )
    const bottomTenting = firstDefined(
        pad.tenting?.back,
        layers.bottom.tenting?.back
    )

    return {
        kicadPad: pad,
        ...pad,
        x: toMil(pad.x),
        y: toMil(pad.y),
        sizeTopX: toMil(layers.top.size.width),
        sizeTopY: toMil(layers.top.size.height),
        sizeMidX: toMil(layers.mid.size.width),
        sizeMidY: toMil(layers.mid.size.height),
        sizeBottomX: toMil(layers.bottom.size.width),
        sizeBottomY: toMil(layers.bottom.size.height),
        holeDiameter: toMil(pad.drill || 0),
        holeShape: drill.shape,
        holeSlotLength: drill.slotLength,
        holeRotation: drill.rotation,
        shapeTop: padShapeCode(layers.top.shape),
        shapeMid: padShapeCode(layers.mid.shape),
        shapeBottom: padShapeCode(layers.bottom.shape),
        rotation: pad.rotation,
        isPlated: pad.type === 'thru_hole',
        componentIndex: componentIndexForFootprint(footprints, pad.footprintId),
        offsetTopX: toMil(layers.top.offset.x),
        offsetTopY: toMil(layers.top.offset.y),
        offsetBottomX: toMil(layers.bottom.offset.x),
        offsetBottomY: toMil(layers.bottom.offset.y),
        padMode: padModeCode(pad.padstack?.mode),
        planeConnectionStyle: firstDefined(
            pad.zoneConnect,
            layers.top.zoneConnect,
            0
        ),
        thermalReliefConductorWidth: toMil(
            firstDefined(
                pad.thermalBridgeWidth,
                layers.top.thermalBridgeWidth,
                0
            )
        ),
        thermalReliefAirGap: toMil(
            firstDefined(pad.thermalGap, layers.top.thermalGap, 0)
        ),
        powerPlaneClearance: toMil(
            firstDefined(pad.clearance, layers.top.clearance, 0)
        ),
        pasteMaskExpansion: toMil(firstDefined(pad.solderPasteMargin, 0)),
        solderMaskExpansion: toMil(firstDefined(pad.solderMaskMargin, 0)),
        pasteMaskExpansionMode:
            pad.solderPasteMargin === undefined &&
            pad.solderPasteMarginRatio === undefined
                ? 0
                : 1,
        solderMaskExpansionMode: pad.solderMaskMargin === undefined ? 0 : 1,
        hasRoundedRect: hasRoundedRectPad(pad, layers),
        roundedRectShapeTop: padShapeCode(layers.top.shape),
        cornerRadiusTop: cornerRadiusPercent(layers.top.roundrectRatio),
        innerLayerSizes: innerLayerSizes(layers.stack),
        innerLayerShapes: innerLayerShapes(layers.stack),
        layerOffsets: layerOffsets(layers.stack),
        layerShapes: layerShapes(layers.stack),
        cornerRadiusByLayer: cornerRadiusByLayer(layers.stack),
        fullStackLayerEntries: fullStackLayerEntries(layers.stack),
        isTestFabTop: padProperties.includes('pad_prop_testpoint') || undefined,
        isTestFabBottom:
            padProperties.includes('pad_prop_testpoint') || undefined,
        isTentingTop:
            topTenting === undefined ? undefined : Boolean(topTenting),
        isTentingBottom:
            bottomTenting === undefined ? undefined : Boolean(bottomTenting),
        ...optionalNetIndex(pad.netIndex),
        netName: pad.netName || ''
    }
}

/**
 * Builds top, middle, bottom, and full-stack pad layer detail.
 * @param {object} pad KiCad pad.
 * @returns {{ top: object, mid: object, bottom: object, stack: object[] }}
 */
function padLayerSummary(pad) {
    const base = basePadLayer(pad)
    const stack = normalizedPadstackLayers(pad, base)
    const top = resolveFacePadLayer(pad, stack, base, 'F.Cu')
    const mid = resolveInnerPadLayer(pad, stack, base)
    const bottom = resolveFacePadLayer(pad, stack, base, 'B.Cu')

    return { top, mid, bottom, stack }
}

/**
 * Resolves a pad's copper data for one outer board face.
 * @param {object} pad KiCad pad.
 * @param {object[]} stack Padstack layer entries.
 * @param {object} base Base pad layer.
 * @param {'F.Cu' | 'B.Cu'} layerName Copper layer name.
 * @returns {object}
 */
function resolveFacePadLayer(pad, stack, base, layerName) {
    return (
        findLayerEntry(stack, layerName) ||
        (padUsesCopperLayer(pad, layerName)
            ? { ...base, layer: layerName }
            : emptyPadLayer(layerName))
    )
}

/**
 * Resolves representative inner copper pad data.
 * @param {object} pad KiCad pad.
 * @param {object[]} stack Padstack layer entries.
 * @param {object} base Base pad layer.
 * @returns {object}
 */
function resolveInnerPadLayer(pad, stack, base) {
    const explicitInner =
        findLayerEntry(stack, 'Inner') ||
        stack.find((layer) => isInnerCopperLayer(layer.layer))

    if (explicitInner) {
        return explicitInner
    }

    return padUsesInnerCopper(pad)
        ? { ...base, layer: 'Inner' }
        : emptyPadLayer('Inner')
}

/**
 * Returns whether a pad's layer set includes an outer copper layer.
 * @param {object} pad KiCad pad.
 * @param {'F.Cu' | 'B.Cu'} layerName Copper layer name.
 * @returns {boolean}
 */
function padUsesCopperLayer(pad, layerName) {
    const layers = Array.isArray(pad.layers) ? pad.layers : []

    if (!layers.length) {
        return layerName === 'F.Cu'
    }

    return layers.includes('*.Cu') || layers.includes(layerName)
}

/**
 * Returns whether a pad has inner-layer copper participation.
 * @param {object} pad KiCad pad.
 * @returns {boolean}
 */
function padUsesInnerCopper(pad) {
    const layers = Array.isArray(pad.layers) ? pad.layers : []

    return (
        layers.includes('*.Cu') ||
        layers.some((layer) => isInnerCopperLayer(layer))
    )
}

/**
 * Checks whether a KiCad layer name refers to inner copper.
 * @param {string | undefined} layer Layer name.
 * @returns {boolean}
 */
function isInnerCopperLayer(layer) {
    const name = String(layer || '')

    return name.endsWith('.Cu') && name !== 'F.Cu' && name !== 'B.Cu'
}

/**
 * Builds an absent copper layer record.
 * @param {string} layerName Layer name.
 * @returns {object}
 */
function emptyPadLayer(layerName) {
    return {
        layer: layerName,
        shape: '',
        size: { width: 0, height: 0 },
        offset: { x: 0, y: 0 },
        rectDelta: { x: 0, y: 0 }
    }
}

/**
 * Creates the implicit single-layer pad data used before a padstack override.
 * @param {object} pad KiCad pad.
 * @returns {object}
 */
function basePadLayer(pad) {
    return {
        layer: '',
        shape: pad.shape || 'rect',
        size: { width: pad.width || 0, height: pad.height || 0 },
        offset: { x: 0, y: 0 },
        rectDelta: pad.rectDelta || { x: 0, y: 0 },
        roundrectRatio: pad.roundrectRatio,
        chamferRatio: pad.chamferRatio,
        thermalBridgeWidth: pad.thermalBridgeWidth,
        thermalGap: pad.thermalGap,
        thermalBridgeAngle: pad.thermalBridgeAngle,
        zoneConnect: pad.zoneConnect,
        clearance: pad.clearance,
        tenting: pad.tenting
    }
}

/**
 * Builds normalized padstack layer entries with base fallback fields.
 * @param {object} pad KiCad pad.
 * @param {object} base Base pad layer.
 * @returns {object[]}
 */
function normalizedPadstackLayers(pad, base) {
    return (pad.padstack?.layers || []).map((layer) => ({
        ...base,
        ...layer,
        layer: layer.layer || '',
        shape: layer.shape || base.shape,
        size: sizeOrFallback(layer.size, base.size),
        offset: vectorOrFallback(layer.offset, base.offset),
        rectDelta: vectorOrFallback(layer.rectDelta, base.rectDelta)
    }))
}

/**
 * Finds a padstack entry by KiCad layer name.
 * @param {object[]} stack Padstack entries.
 * @param {string} layerName KiCad layer name.
 * @returns {object | undefined}
 */
function findLayerEntry(stack, layerName) {
    return stack.find((layer) => layer.layer === layerName)
}

/**
 * Returns a size object, using fallback dimensions when absent.
 * @param {object | undefined} size Size value.
 * @param {{ width: number, height: number }} fallback Fallback size.
 * @returns {{ width: number, height: number }}
 */
function sizeOrFallback(size, fallback) {
    return {
        width: firstDefined(size?.width, fallback.width, 0),
        height: firstDefined(size?.height, fallback.height, 0)
    }
}

/**
 * Returns a vector object, using fallback coordinates when absent.
 * @param {object | undefined} vector Vector value.
 * @param {{ x: number, y: number }} fallback Fallback vector.
 * @returns {{ x: number, y: number }}
 */
function vectorOrFallback(vector, fallback) {
    return {
        x: firstDefined(vector?.x, fallback.x, 0),
        y: firstDefined(vector?.y, fallback.y, 0)
    }
}

/**
 * Builds Altium-style drill slot metadata.
 * @param {object} pad KiCad pad.
 * @returns {{ shape: number | null, slotLength: number | null, rotation: number | null }}
 */
function drillSummary(pad) {
    if (pad.drillShape !== 'oval') {
        return { shape: null, slotLength: null, rotation: null }
    }

    const width = Number(pad.drillWidth || pad.drill || 0)
    const height = Number(pad.drillHeight || pad.drill || 0)
    return {
        shape: 2,
        slotLength: toMil(Math.max(width, height)),
        rotation: height > width ? 90 : 0
    }
}

/**
 * Maps KiCad padstack modes to Altium-style mode hints.
 * @param {string} mode KiCad padstack mode.
 * @returns {number}
 */
function padModeCode(mode) {
    const normalized = String(mode || '').toLowerCase()
    if (normalized === 'custom') return 2
    if (normalized === 'front_inner_back') return 1
    return 0
}

/**
 * Maps KiCad pad shape names to stable numeric shape hints.
 * @param {string} shape Shape name.
 * @returns {number}
 */
function padShapeCode(shape) {
    const normalized = String(shape || '').toLowerCase()
    if (normalized === 'circle') return 1
    if (normalized === 'oval') return 2
    if (normalized === 'trapezoid') return 3
    if (normalized === 'roundrect') return 4
    if (normalized === 'custom') return 9
    return 0
}

/**
 * Returns whether any pad layer carries rounded rectangle data.
 * @param {object} pad KiCad pad.
 * @param {{ stack: object[] }} layers Layer summary.
 * @returns {boolean}
 */
function hasRoundedRectPad(pad, layers) {
    return (
        pad.shape === 'roundrect' ||
        Boolean(pad.roundrectRatio) ||
        layers.stack.some((layer) => {
            return layer.shape === 'roundrect' || Boolean(layer.roundrectRatio)
        })
    )
}

/**
 * Converts a KiCad roundrect ratio to a percentage-style value.
 * @param {number | undefined} ratio KiCad rounded rectangle ratio.
 * @returns {number | null}
 */
function cornerRadiusPercent(ratio) {
    if (ratio === undefined || ratio === null) return null
    return Math.round(Number(ratio || 0) * 100)
}

/**
 * Builds non-empty inner-layer size entries.
 * @param {object[]} stack Padstack entries.
 * @returns {{ layerNumber: number, width: number, height: number }[]}
 */
function innerLayerSizes(stack) {
    return stack
        .map((layer) => ({
            layerNumber: layerNumberForName(layer.layer),
            width: toMil(layer.size.width),
            height: toMil(layer.size.height)
        }))
        .filter((entry) => {
            return entry.layerNumber > 1 && entry.layerNumber < 32
        })
}

/**
 * Builds non-empty inner-layer shape entries.
 * @param {object[]} stack Padstack entries.
 * @returns {{ layerNumber: number, shape: number }[]}
 */
function innerLayerShapes(stack) {
    return stack
        .map((layer) => ({
            layerNumber: layerNumberForName(layer.layer),
            shape: padShapeCode(layer.shape)
        }))
        .filter((entry) => {
            return entry.layerNumber > 1 && entry.layerNumber < 32
        })
}

/**
 * Builds non-empty per-layer offset entries.
 * @param {object[]} stack Padstack entries.
 * @returns {{ layerNumber: number, x: number, y: number }[]}
 */
function layerOffsets(stack) {
    return stack
        .map((layer) => ({
            layerNumber: layerNumberForName(layer.layer),
            x: toMil(layer.offset.x),
            y: toMil(layer.offset.y)
        }))
        .filter((entry) => entry.x || entry.y)
}

/**
 * Builds non-empty per-layer shape entries.
 * @param {object[]} stack Padstack entries.
 * @returns {{ layerNumber: number, shape: number }[]}
 */
function layerShapes(stack) {
    return stack
        .map((layer) => ({
            layerNumber: layerNumberForName(layer.layer),
            shape: padShapeCode(layer.shape)
        }))
        .filter((entry) => entry.shape)
}

/**
 * Builds non-empty per-layer corner radius entries.
 * @param {object[]} stack Padstack entries.
 * @returns {{ layerNumber: number, cornerRadius: number }[]}
 */
function cornerRadiusByLayer(stack) {
    return stack
        .map((layer) => ({
            layerNumber: layerNumberForName(layer.layer),
            cornerRadius: cornerRadiusPercent(layer.roundrectRatio)
        }))
        .filter((entry) => entry.cornerRadius)
}

/**
 * Builds full-stack layer entries that mirror Altium's extension table shape.
 * @param {object[]} stack Padstack entries.
 * @returns {{ layerCode: number, modeFlags: number, enabled: boolean, sizeX: number, sizeY: number, cornerRadius: number }[]}
 */
function fullStackLayerEntries(stack) {
    return stack.map((layer) => ({
        layerCode: layerNumberForName(layer.layer),
        modeFlags: 0,
        enabled: true,
        sizeX: toMil(layer.size.width),
        sizeY: toMil(layer.size.height),
        cornerRadius: cornerRadiusPercent(layer.roundrectRatio) || 0
    }))
}

/**
 * Maps KiCad layer names to Altium physical layer numbers.
 * @param {string} layer KiCad layer name.
 * @returns {number}
 */
function layerNumberForName(layer) {
    const normalized = String(layer || '')
    if (normalized === 'F.Cu') return 1
    if (normalized === 'B.Cu') return 32
    if (normalized === 'Inner') return 2

    const innerMatch = normalized.match(/^In(\d+)\.Cu$/)
    if (innerMatch) return Number(innerMatch[1]) + 1

    return KicadPcbLayerMetadata.layerIdForName(normalized)
}

/**
 * Returns the first defined value.
 * @param {...unknown} values Candidate values.
 * @returns {unknown}
 */
function firstDefined(...values) {
    return values.find((value) => value !== undefined && value !== null)
}

/**
 * Resolves a component index by footprint id.
 * @param {object[]} footprints Footprints.
 * @param {string} footprintId Footprint id.
 * @returns {number | null}
 */
function componentIndexForFootprint(footprints, footprintId) {
    const index = (footprints || []).findIndex(
        (footprint) => footprint.id === footprintId
    )
    return index >= 0 ? index : null
}

/**
 * Builds a polygon projection for one filled zone drawing.
 * @param {object} zone Zone drawing.
 * @returns {object}
 */
function zonePolygonFromDrawing(zone) {
    const contours = zone.contours?.length ? zone.contours : [zone.points || []]
    return {
        layer: zone.layer,
        ...optionalNetIndex(zone.netIndex),
        netName: zone.netName || '',
        hatch: zone.hatch || {},
        connectPads: zone.connectPads || {},
        minThickness: zone.minThickness,
        fillPolicy: zone.fillPolicy || {},
        segments: KicadBoardOutlineBuilder.segmentsFromPoints(
            contours[0] || [],
            toMil
        ),
        contours: contours
            .map((points) =>
                KicadBoardOutlineBuilder.segmentsFromPoints(points, toMil)
            )
            .filter((entry) => {
                return entry.length > 0
            })
    }
}

/**
 * Builds board BOM rows from footprints.
 * @param {object[]} footprints Footprints.
 * @returns {object[]}
 */
function groupBoardBomRows(footprints) {
    const groups = new Map()

    for (const footprint of footprints || []) {
        if (footprint.excludeFromBom) continue

        const entry = {
            designator: footprint.reference,
            pattern: footprint.libraryName,
            source: footprint.libraryName,
            value: footprint.value || ''
        }
        const key = [entry.pattern, entry.source, entry.value].join('::')

        if (!groups.has(key)) {
            groups.set(key, {
                designators: [],
                quantity: 0,
                pattern: entry.pattern,
                source: entry.source,
                value: entry.value
            })
        }

        const row = groups.get(key)
        row.designators.push(entry.designator)
        row.quantity += 1
    }

    return [...groups.values()]
        .map((row) => ({
            ...row,
            designators: row.designators.sort((left, right) =>
                left.localeCompare(right, undefined, { numeric: true })
            )
        }))
        .sort((left, right) =>
            left.designators[0].localeCompare(right.designators[0], undefined, {
                numeric: true
            })
        )
}

/**
 * Normalizes board text into shared PCB text shape.
 * @param {object} text KiCad text.
 * @returns {object}
 */
function normalizeBoardText(text) {
    return {
        x: toMil(text.x),
        y: toMil(text.y),
        text: text.value,
        value: text.value,
        rotation: text.rotation,
        layer: text.layer,
        side: text.side,
        ownerIndex: text.ownerId || undefined,
        ...(text.fontFace ? { fontFace: text.fontFace } : {})
    }
}

/**
 * Returns an optional primitive net index field.
 * @param {unknown} value Net index.
 * @returns {{ netIndex: number } | object}
 */
function optionalNetIndex(value) {
    const netIndex = Number(value)
    return Number.isInteger(netIndex) ? { netIndex } : {}
}
