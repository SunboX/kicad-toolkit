// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadPcbLayerMetadata } from '../core/kicad/KicadPcbLayerMetadata.mjs'

const pcbSemanticSchema = 'kicad-toolkit.pcb.svg.semantics.a1'

/**
 * Builds semantic attributes and metadata for KiCad PCB SVG output.
 */
export class PcbSvgSemanticMetadata {
    /**
     * Returns the KiCad PCB SVG semantic schema id.
     * @returns {string}
     */
    static get schema() {
        return pcbSemanticSchema
    }

    /**
     * Builds lookup context for one render.
     * @param {object} board Raw KiCad board model.
     * @param {object} [options] View options.
     * @returns {object}
     */
    static buildContext(board, options = {}) {
        const displayLayers =
            PcbSvgSemanticMetadata.displayLayerDescriptors(board)
        const includedLayerKeys = Array.isArray(options.includedLayerKeys)
            ? options.includedLayerKeys
            : displayLayers.map((layer) => layer.layerKey)
        const componentIndexes = objectIndexMap(board?.footprints || [])
        return {
            board,
            displayLayers,
            includedLayerKeys,
            layerView: options.layerView || null,
            viewKind: options.viewKind || 'top-composite',
            primitiveIndexes: {
                tracks: objectIndexMap(
                    (board?.drawings || []).filter(
                        (drawing) => drawing.type === 'segment'
                    )
                ),
                vias: objectIndexMap(
                    (board?.drawings || []).filter(
                        (drawing) => drawing.type === 'via'
                    )
                ),
                zones: objectIndexMap(
                    (board?.drawings || []).filter(
                        (drawing) => drawing.type === 'zone'
                    )
                ),
                arcs: objectIndexMap(
                    (board?.drawings || []).filter(
                        (drawing) =>
                            drawing.type === 'arc' &&
                            drawing.sourceType === 'arc'
                    )
                ),
                pads: objectIndexMap(board?.pads || []),
                texts: objectIndexMap(board?.texts || []),
                components: componentIndexes
            },
            componentsById: componentsById(board?.footprints || []),
            componentIndexes,
            netsByIndex: netsByIndex(board?.nets || []),
            layersByKey: new Map(
                displayLayers.map((layer) => [layer.layerKey, layer])
            )
        }
    }

    /**
     * Returns display layer descriptors for deterministic layer exports.
     * @param {object} board Raw KiCad board model.
     * @returns {object[]}
     */
    static displayLayerDescriptors(board) {
        const seen = new Set()
        const layers = []
        const add = (name) => {
            const layerName = String(name || '').trim()
            if (!layerName || seen.has(layerName)) return
            if (!isDisplayLayer(layerName)) return
            seen.add(layerName)
            layers.push(layerDescriptor(layerName))
        }

        for (const layer of board?.layers || []) {
            add(layer?.name || layer?.canonicalName)
        }
        if (layers.length === 0) {
            for (const primitive of board?.drawings || []) {
                for (const layerName of primitiveLayerNames(primitive)) {
                    add(layerName)
                }
            }
            for (const pad of board?.pads || []) {
                for (const layerName of primitiveLayerNames(pad)) {
                    add(layerName)
                }
            }
            for (const text of board?.texts || []) {
                for (const layerName of primitiveLayerNames(text)) {
                    add(layerName)
                }
            }
        }

        return layers
    }

    /**
     * Returns a board filtered to one display layer.
     * @param {object} board Raw KiCad board model.
     * @param {object} layerView Layer descriptor.
     * @returns {object}
     */
    static filterBoardForLayer(board, layerView) {
        return {
            ...board,
            drawings: (board?.drawings || []).filter((primitive) =>
                PcbSvgSemanticMetadata.primitiveBelongsToLayer(
                    primitive,
                    layerView
                )
            ),
            pads: (board?.pads || []).filter((primitive) =>
                PcbSvgSemanticMetadata.primitiveBelongsToLayer(
                    primitive,
                    layerView
                )
            ),
            texts: (board?.texts || []).filter((primitive) =>
                PcbSvgSemanticMetadata.primitiveBelongsToLayer(
                    primitive,
                    layerView
                )
            )
        }
    }

    /**
     * Checks whether a primitive references a display layer.
     * @param {object} primitive Primitive.
     * @param {object} layerView Layer descriptor.
     * @returns {boolean}
     */
    static primitiveBelongsToLayer(primitive, layerView) {
        return primitiveLayerNames(primitive).includes(layerView.layerKey)
    }

    /**
     * Builds root SVG attributes for semantic metadata.
     * @param {object} context Render semantic context.
     * @returns {string}
     */
    static rootAttributes(context) {
        return renderDataAttributes({
            'data-semantic-schema': pcbSemanticSchema,
            'data-view-kind': context.viewKind,
            'data-included-layer-keys': context.includedLayerKeys.join(','),
            'data-layer-view-key': context.layerView?.layerKey
        })
    }

    /**
     * Builds the metadata sidecar element.
     * @param {object} context Render semantic context.
     * @returns {string}
     */
    static metadataElement(context) {
        return (
            '<metadata id="pcb-semantic-metadata" data-schema="' +
            pcbSemanticSchema +
            '">' +
            escapeHtml(JSON.stringify(buildMetadata(context))) +
            '</metadata>'
        )
    }

    /**
     * Builds board-outline semantic attributes.
     * @returns {string}
     */
    static boardAttributes() {
        return renderDataAttributes({
            'data-feature': 'board-outline',
            'data-element-key': 'pcb-board-outline'
        })
    }

    /**
     * Builds semantic attributes for one primitive.
     * @param {object} primitive Primitive source.
     * @param {string} kind Primitive kind.
     * @param {object} context Render semantic context.
     * @param {object} [extra] Extra attributes.
     * @returns {string}
     */
    static primitiveAttributes(primitive, kind, context, extra = {}) {
        const elementKey = elementKeyForPrimitive(primitive, kind, context)
        const layer = layerForPrimitive(primitive, context)
        const netName = netNameForPrimitive(primitive, context)
        const component = componentForPrimitive(primitive, context)
        return renderDataAttributes({
            'data-primitive': kind,
            'data-element-key': elementKey,
            'data-layer-key': layer?.layerKey,
            'data-layer-display-name': layer?.displayName,
            'data-layer-id': layer?.layerId,
            'data-net': netName,
            'data-component': component?.reference,
            'data-pad-number': padNumber(primitive),
            ...extra
        })
    }
}

/**
 * Builds the JSON metadata sidecar.
 * @param {object} context Render semantic context.
 * @returns {object}
 */
function buildMetadata(context) {
    return stripEmpty({
        schema: pcbSemanticSchema,
        view: {
            kind: context.viewKind,
            board: boardMetadata(context.board),
            layerSet: {
                includedLayerKeys: context.includedLayerKeys,
                roles: context.displayLayers
                    .filter((layer) =>
                        context.includedLayerKeys.includes(layer.layerKey)
                    )
                    .map(({ layerKey, role }) => ({ layerKey, role })),
                layerView: context.layerView
                    ? {
                          layerKey: context.layerView.layerKey,
                          displayName: context.layerView.displayName,
                          role: context.layerView.role
                      }
                    : undefined
            },
            drills: drillMetadata(context)
        },
        nets: netMetadata(context),
        components: componentMetadata(context)
    })
}

/**
 * Builds compact board metadata.
 * @param {object} board Board model.
 * @returns {object}
 */
function boardMetadata(board) {
    const bounds = board?.bounds || {}
    return {
        title: board?.title || '',
        fileName: board?.fileName || '',
        centroid: {
            x: roundMetric((Number(bounds.minX) + Number(bounds.maxX)) / 2),
            y: roundMetric((Number(bounds.minY) + Number(bounds.maxY)) / 2)
        }
    }
}

/**
 * Builds net-to-element metadata records.
 * @param {object} context Render semantic context.
 * @returns {object[]}
 */
function netMetadata(context) {
    const groups = new Map()
    const add = (name, elementKey, component, pad) => {
        const netName = String(name || '').trim()
        if (!netName || !elementKey) return
        if (!groups.has(netName)) {
            groups.set(netName, {
                name: netName,
                elementKeys: [],
                components: new Set(),
                pads: new Set()
            })
        }
        const group = groups.get(netName)
        group.elementKeys.push(elementKey)
        if (component?.reference) group.components.add(component.reference)
        if (component?.reference && pad) {
            group.pads.add(component.reference + ':' + pad)
        }
    }

    for (const drawing of context.board?.drawings || []) {
        const kind = semanticKindForDrawing(drawing)
        if (!['track', 'via', 'zone', 'arc'].includes(kind)) continue
        add(
            netNameForPrimitive(drawing, context),
            elementKeyForPrimitive(drawing, kind, context),
            componentForPrimitive(drawing, context),
            ''
        )
    }
    for (const pad of context.board?.pads || []) {
        const component = componentForPrimitive(pad, context)
        add(
            netNameForPrimitive(pad, context),
            elementKeyForPrimitive(pad, 'pad', context),
            component,
            padNumber(pad)
        )
    }

    return [...groups.values()].map((group) => ({
        name: group.name,
        elementKeys: dedupe(group.elementKeys),
        components: [...group.components].sort(),
        pads: [...group.pads].sort()
    }))
}

/**
 * Builds component-to-element metadata records.
 * @param {object} context Render semantic context.
 * @returns {object[]}
 */
function componentMetadata(context) {
    return (context.board?.footprints || []).map((footprint) => {
        const pads = (context.board?.pads || []).filter(
            (pad) => pad.footprintId === footprint.id
        )
        return {
            designator: footprint.reference || '',
            elementKeys: [
                elementKeyForPrimitive(footprint, 'component', context),
                ...pads.map((pad) =>
                    elementKeyForPrimitive(pad, 'pad', context)
                )
            ],
            pads: pads.map(padNumber).filter(Boolean).sort(),
            nets: dedupe(
                pads
                    .map((pad) => netNameForPrimitive(pad, context))
                    .filter(Boolean)
            )
        }
    })
}

/**
 * Builds rendered drill metadata.
 * @param {object} context Render semantic context.
 * @returns {object[]}
 */
function drillMetadata(context) {
    return [
        ...(context.board?.drawings || [])
            .filter((drawing) => drawing.type === 'via' && drawing.drill)
            .map((via) => ({
                elementKey: elementKeyForPrimitive(via, 'via-hole', context),
                owner: 'via',
                holeKind: 'via',
                renderState: 'open'
            })),
        ...(context.board?.pads || [])
            .filter((pad) => pad.drill)
            .map((pad) => ({
                elementKey: elementKeyForPrimitive(pad, 'pad-hole', context),
                owner: 'pad',
                holeKind: 'pad',
                renderState: 'open'
            }))
    ]
}

/**
 * Returns an SVG element key for a primitive.
 * @param {object} primitive Primitive.
 * @param {string} kind Semantic kind.
 * @param {object} context Render semantic context.
 * @returns {string}
 */
function elementKeyForPrimitive(primitive, kind, context) {
    const collection = collectionForKind(kind)
    const index = context.primitiveIndexes[collection]?.get(primitive) ?? 0
    return 'pcb-' + kind + '-' + index
}

/**
 * Resolves the primitive-index collection for one semantic kind.
 * @param {string} kind Primitive kind.
 * @returns {string}
 */
function collectionForKind(kind) {
    if (kind === 'track') return 'tracks'
    if (kind === 'via' || kind === 'via-hole') return 'vias'
    if (kind === 'zone') return 'zones'
    if (kind === 'arc') return 'arcs'
    if (kind === 'pad' || kind === 'pad-hole') return 'pads'
    if (kind === 'text') return 'texts'
    if (kind === 'component') return 'components'
    return 'tracks'
}

/**
 * Resolves a layer descriptor for one primitive.
 * @param {object} primitive Primitive.
 * @param {object} context Render context.
 * @returns {object | null}
 */
function layerForPrimitive(primitive, context) {
    const layerName = primitiveLayerNames(primitive).find((name) =>
        context.layersByKey.has(name)
    )
    return layerName ? context.layersByKey.get(layerName) : null
}

/**
 * Resolves net name for one primitive.
 * @param {object} primitive Primitive.
 * @param {object} context Render context.
 * @returns {string}
 */
function netNameForPrimitive(primitive, context) {
    if (primitive?.netName) return String(primitive.netName)
    const netIndex = primitive?.netIndex
    return context.netsByIndex.get(Number(netIndex))?.name || ''
}

/**
 * Resolves component for one primitive.
 * @param {object} primitive Primitive.
 * @param {object} context Render context.
 * @returns {object | null}
 */
function componentForPrimitive(primitive, context) {
    const id = primitive?.footprintId || primitive?.ownerId
    if (id && context.componentsById.has(id)) {
        return context.componentsById.get(id)
    }
    return null
}

/**
 * Returns a pad number label.
 * @param {object} primitive Primitive.
 * @returns {string}
 */
function padNumber(primitive) {
    return String(primitive?.number || '').trim()
}

/**
 * Resolves the semantic kind for one drawing primitive.
 * @param {object} drawing Drawing.
 * @returns {string}
 */
function semanticKindForDrawing(drawing) {
    if (drawing?.type === 'segment') return 'track'
    if (drawing?.type === 'via') return 'via'
    if (drawing?.type === 'zone') return 'zone'
    if (drawing?.type === 'arc') return 'arc'
    return 'drawing'
}

/**
 * Builds layer descriptors.
 * @param {string} layerName KiCad layer name.
 * @returns {object}
 */
function layerDescriptor(layerName) {
    return {
        layerKey: layerName,
        layerId: KicadPcbLayerMetadata.layerIdForName(layerName),
        displayName: layerName,
        role: layerRole(layerName)
    }
}

/**
 * Resolves a compact layer role.
 * @param {string} layerName Layer name.
 * @returns {string}
 */
function layerRole(layerName) {
    if (layerName.endsWith('.Cu')) return 'copper'
    if (layerName.endsWith('.SilkS')) return 'silkscreen'
    if (layerName.endsWith('.Mask')) return 'solder-mask'
    if (layerName === 'Edge.Cuts') return 'board-outline'
    return 'technical'
}

/**
 * Checks whether a layer is a renderable display layer.
 * @param {string} layerName Layer name.
 * @returns {boolean}
 */
function isDisplayLayer(layerName) {
    return (
        layerName.endsWith('.Cu') ||
        layerName.endsWith('.SilkS') ||
        layerName.endsWith('.Mask')
    )
}

/**
 * Returns primitive layer names.
 * @param {object} primitive Primitive.
 * @returns {string[]}
 */
function primitiveLayerNames(primitive) {
    if (Array.isArray(primitive?.layers)) {
        return primitive.layers
            .map((layer) => String(layer || '').trim())
            .filter(Boolean)
    }
    return String(primitive?.layer || '')
        .split(',')
        .map((layer) => layer.trim())
        .filter(Boolean)
}

/**
 * Builds a map from object identity to array index.
 * @param {object[]} records Records.
 * @returns {Map<object, number>}
 */
function objectIndexMap(records) {
    return new Map(
        (Array.isArray(records) ? records : []).map((item, index) => [
            item,
            index
        ])
    )
}

/**
 * Builds component lookups by id.
 * @param {object[]} footprints Footprints.
 * @returns {Map<string, object>}
 */
function componentsById(footprints) {
    const map = new Map()
    for (const footprint of footprints || []) {
        if (footprint?.id) map.set(footprint.id, footprint)
    }
    return map
}

/**
 * Builds net lookups by KiCad net index.
 * @param {object[]} nets Nets.
 * @returns {Map<number, object>}
 */
function netsByIndex(nets) {
    const map = new Map()
    for (const net of nets || []) {
        const index = Number(net?.index ?? net?.netIndex)
        if (Number.isFinite(index)) map.set(index, net)
    }
    return map
}

/**
 * Renders SVG data attributes.
 * @param {Record<string, unknown>} attributes Attributes.
 * @returns {string}
 */
function renderDataAttributes(attributes) {
    return Object.entries(attributes)
        .filter(
            ([, value]) => value !== undefined && value !== null && value !== ''
        )
        .map(([name, value]) => {
            const text = Array.isArray(value) ? value.join(',') : String(value)
            return `${name}="${escapeAttribute(text)}"`
        })
        .join(' ')
}

/**
 * Removes empty metadata fields recursively.
 * @param {unknown} value Value.
 * @returns {unknown}
 */
function stripEmpty(value) {
    if (Array.isArray(value)) {
        return value.map(stripEmpty).filter((item) => item !== undefined)
    }
    if (!value || typeof value !== 'object') return value
    const entries = Object.entries(value)
        .map(([key, child]) => [key, stripEmpty(child)])
        .filter(([, child]) => {
            if (child === undefined || child === null || child === '')
                return false
            if (Array.isArray(child) && child.length === 0) return false
            return !(
                typeof child === 'object' &&
                !Array.isArray(child) &&
                Object.keys(child).length === 0
            )
        })
    return Object.fromEntries(entries)
}

/**
 * Deduplicates string values.
 * @param {string[]} values Values.
 * @returns {string[]}
 */
function dedupe(values) {
    return [...new Set(values.filter(Boolean))]
}

/**
 * Rounds one metadata metric.
 * @param {number} value Number.
 * @returns {number}
 */
function roundMetric(value) {
    return Number.isFinite(value) ? Number(value.toFixed(6)) : 0
}

/**
 * Escapes text content.
 * @param {unknown} value Value.
 * @returns {string}
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
}

/**
 * Escapes SVG attribute values.
 * @param {unknown} value Value.
 * @returns {string}
 */
function escapeAttribute(value) {
    return escapeHtml(value).replaceAll('"', '&quot;')
}
