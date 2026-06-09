// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { Geometry } from '../core/kicad/Geometry.mjs'
import { KicadPcbPadParser } from '../core/kicad/KicadPcbPadParser.mjs'
import { PcbInteractionItemRegistry } from './PcbInteractionItemRegistry.mjs'

const TYPE_PRIORITY = {
    track: 100,
    pad: 90,
    via: 80,
    component: 50,
    text: 30,
    zone: 10
}

const PLURAL_TYPE_KEYS = {
    component: 'components',
    pad: 'pads',
    text: 'footprint-text',
    track: 'tracks',
    via: 'vias',
    zone: 'zones'
}

/**
 * Builds and queries selectable PCB items.
 */
export class PcbInteractionIndex {
    /**
     * Resolves a raw board model from raw or wrapped renderer input.
     * @param {object | null | undefined} value Board or document model.
     * @returns {object | null}
     */
    static resolveBoardModel(value) {
        if (!value) return null
        if (value?.pcb?.kicadBoard) return value.pcb.kicadBoard
        return value
    }

    /**
     * Builds all selectable items for a board.
     * @param {object} boardOrDocument Toolkit board or wrapped document model.
     * @returns {object[]}
     */
    static build(boardOrDocument) {
        const board = PcbInteractionIndex.resolveBoardModel(boardOrDocument)
        if (!board) return []

        return PcbInteractionIndex.#defaultRegistry()
            .extract(board, { board })
            .map((item, index) =>
                PcbInteractionIndex.#normalizeItem(item, index)
            )
            .filter(Boolean)
    }

    /**
     * Returns all hit candidates at the requested point.
     * @param {object} boardOrDocument Toolkit board or wrapped document model.
     * @param {{ x?: unknown, y?: unknown }} point Hit-test point.
     * @param {object} [options] Hit-test options.
     * @returns {object[]}
     */
    static hitTest(boardOrDocument, point, options = {}) {
        return PcbInteractionIndex.hitTestItems(
            PcbInteractionIndex.build(boardOrDocument),
            point,
            options
        )
    }

    /**
     * Returns hit candidates from an already-built interaction item list.
     * @param {object[]} items Built interaction items.
     * @param {{ x?: unknown, y?: unknown }} point Hit-test point.
     * @param {object} [options] Hit-test options.
     * @returns {object[]}
     */
    static hitTestItems(items, point, options = {}) {
        return (Array.isArray(items) ? items : [])
            .filter((item) =>
                PcbInteractionIndex.#isVisibleCandidate(item, options)
            )
            .filter((item) =>
                PcbInteractionIndex.#containsPoint(
                    item.geometry,
                    point,
                    Number(options?.tolerance) || 0
                )
            )
            .sort(PcbInteractionIndex.#compareCandidates)
    }

    /**
     * Picks the highest-priority candidate at the requested point.
     * @param {object} boardOrDocument Toolkit board or wrapped document model.
     * @param {{ x?: unknown, y?: unknown }} point Hit-test point.
     * @param {object} [options] Hit-test options.
     * @returns {object | null}
     */
    static pick(boardOrDocument, point, options = {}) {
        return (
            PcbInteractionIndex.hitTest(boardOrDocument, point, options)[0] ||
            null
        )
    }

    /**
     * Creates the default item extractor registry.
     * @returns {PcbInteractionItemRegistry}
     */
    static #defaultRegistry() {
        return PcbInteractionItemRegistry.create()
            .register('zones', PcbInteractionIndex.#extractZones)
            .register('tracks', PcbInteractionIndex.#extractTracks)
            .register('pads', PcbInteractionIndex.#extractPads)
            .register('vias', PcbInteractionIndex.#extractVias)
            .register('components', PcbInteractionIndex.#extractComponents)
            .register('footprint-text', PcbInteractionIndex.#extractTexts)
    }

    /**
     * Extracts selectable zones.
     * @param {object} board Board model.
     * @returns {object[]}
     */
    static #extractZones(board) {
        return PcbInteractionIndex.#drawings(board)
            .filter((drawing) => drawing.type === 'zone')
            .map((zone, index) => {
                const geometry = PcbInteractionIndex.#zoneGeometry(zone)
                if (!geometry) return null

                return {
                    id: PcbInteractionIndex.#itemId('zone', zone, index),
                    type: 'zone',
                    label: PcbInteractionIndex.#label('Zone', index),
                    layerKeys: PcbInteractionIndex.#layerKeys(zone),
                    netName: PcbInteractionIndex.#netName(zone),
                    side: PcbInteractionIndex.#side(zone),
                    geometry,
                    source: zone
                }
            })
            .filter(Boolean)
    }

    /**
     * Extracts selectable track segments.
     * @param {object} board Board model.
     * @returns {object[]}
     */
    static #extractTracks(board) {
        return PcbInteractionIndex.#drawings(board)
            .filter((drawing) => drawing.type === 'segment')
            .map((track, index) => ({
                id: PcbInteractionIndex.#itemId('track', track, index),
                type: 'track',
                label: PcbInteractionIndex.#label('Track', index),
                layerKeys: PcbInteractionIndex.#layerKeys(track),
                netName: PcbInteractionIndex.#netName(track),
                side: PcbInteractionIndex.#side(track),
                geometry: Geometry.segmentGeometry(
                    track.start || { x: track.x1, y: track.y1 },
                    track.end || { x: track.x2, y: track.y2 },
                    Math.max(0.01, Number(track.strokeWidth) / 2 || 0.01)
                ),
                source: track
            }))
    }

    /**
     * Extracts selectable pads.
     * @param {object} board Board model.
     * @returns {object[]}
     */
    static #extractPads(board) {
        const pads = Array.isArray(board?.pads) ? board.pads : []

        return pads.map((pad, index) => ({
            id: PcbInteractionIndex.#itemId('pad', pad, index),
            type: 'pad',
            label: PcbInteractionIndex.#padLabel(pad, index),
            layerKeys: PcbInteractionIndex.#layerKeys(pad),
            netName: PcbInteractionIndex.#netName(pad),
            componentKey: PcbInteractionIndex.#componentKeyForPad(pad),
            componentId: String(pad?.footprintId || ''),
            side: PcbInteractionIndex.#side(pad),
            geometry: KicadPcbPadParser.geometryForPad(pad),
            source: pad
        }))
    }

    /**
     * Extracts selectable vias.
     * @param {object} board Board model.
     * @returns {object[]}
     */
    static #extractVias(board) {
        return PcbInteractionIndex.#drawings(board)
            .filter((drawing) => drawing.type === 'via')
            .map((via, index) => ({
                id: PcbInteractionIndex.#itemId('via', via, index),
                type: 'via',
                label: PcbInteractionIndex.#label('Via', index),
                layerKeys: PcbInteractionIndex.#layerKeys(via),
                netName: PcbInteractionIndex.#netName(via),
                side: PcbInteractionIndex.#side(via),
                geometry: Geometry.circleGeometry(
                    { x: via.x, y: via.y },
                    Math.max(0.01, Number(via.size) / 2 || 0.01)
                ),
                source: via
            }))
    }

    /**
     * Extracts selectable footprints.
     * @param {object} board Board model.
     * @returns {object[]}
     */
    static #extractComponents(board) {
        const footprints = Array.isArray(board?.footprints)
            ? board.footprints
            : []

        return footprints.map((footprint, index) => ({
            id: PcbInteractionIndex.#itemId('component', footprint, index),
            type: 'component',
            label: PcbInteractionIndex.#componentKey(footprint),
            componentKey: PcbInteractionIndex.#componentKey(footprint),
            componentId: String(footprint?.id || ''),
            layerKeys: PcbInteractionIndex.#layerKeys(footprint),
            side: PcbInteractionIndex.#side(footprint),
            geometry: PcbInteractionIndex.#boundsGeometry(footprint.bounds, {
                x: footprint.x,
                y: footprint.y,
                width: 2,
                height: 2,
                rotation: footprint.rotation
            }),
            source: footprint
        }))
    }

    /**
     * Extracts selectable footprint text.
     * @param {object} board Board model.
     * @returns {object[]}
     */
    static #extractTexts(board) {
        const texts = Array.isArray(board?.texts) ? board.texts : []

        return texts
            .filter((text) => text?.visible !== false)
            .map((text, index) => {
                const height = Math.max(0.5, Number(text?.height) || 0.5)
                const width =
                    Math.max(
                        1,
                        String(text?.value || text?.text || '').length
                    ) *
                    height *
                    0.6

                return {
                    id: PcbInteractionIndex.#itemId('text', text, index),
                    type: 'text',
                    label: String(text?.value || text?.text || 'Text'),
                    componentId: String(text?.ownerId || ''),
                    layerKeys: PcbInteractionIndex.#layerKeys(text),
                    side: PcbInteractionIndex.#side(text),
                    geometry: PcbInteractionIndex.#rotatedRectangleGeometry({
                        x: text.x,
                        y: text.y,
                        width,
                        height,
                        rotation: text.rotation
                    }),
                    source: text
                }
            })
    }

    /**
     * Returns board drawings.
     * @param {object} board Board model.
     * @returns {object[]}
     */
    static #drawings(board) {
        return Array.isArray(board?.drawings) ? board.drawings : []
    }

    /**
     * Builds geometry for a zone.
     * @param {object} zone Zone.
     * @returns {object | null}
     */
    static #zoneGeometry(zone) {
        if (Array.isArray(zone?.points) && zone.points.length >= 3) {
            return Geometry.polygonGeometry(zone.points)
        }
        if (Array.isArray(zone?.contours) && zone.contours.length) {
            const contour = zone.contours.find(
                (entry) => Array.isArray(entry?.points) && entry.points.length
            )
            if (contour) return Geometry.polygonGeometry(contour.points)
        }

        return null
    }

    /**
     * Builds geometry from bounds with a fallback rectangle.
     * @param {object | null | undefined} bounds Bounds.
     * @param {object} fallback Fallback rectangle.
     * @returns {object}
     */
    static #boundsGeometry(bounds, fallback) {
        if (
            Number.isFinite(Number(bounds?.minX)) &&
            Number.isFinite(Number(bounds?.minY)) &&
            Number.isFinite(Number(bounds?.maxX)) &&
            Number.isFinite(Number(bounds?.maxY))
        ) {
            return Geometry.polygonGeometry([
                { x: Number(bounds.minX), y: Number(bounds.minY) },
                { x: Number(bounds.maxX), y: Number(bounds.minY) },
                { x: Number(bounds.maxX), y: Number(bounds.maxY) },
                { x: Number(bounds.minX), y: Number(bounds.maxY) }
            ])
        }

        return PcbInteractionIndex.#rotatedRectangleGeometry(fallback)
    }

    /**
     * Builds a rotated rectangle geometry.
     * @param {object} rectangle Rectangle.
     * @returns {object}
     */
    static #rotatedRectangleGeometry(rectangle) {
        return Geometry.polygonGeometry(
            Geometry.rotatedRectanglePoints({
                x: Number(rectangle?.x) || 0,
                y: Number(rectangle?.y) || 0,
                width: Math.max(0, Number(rectangle?.width) || 0),
                height: Math.max(0, Number(rectangle?.height) || 0),
                rotation: Number(rectangle?.rotation) || 0
            })
        )
    }

    /**
     * Normalizes item metadata.
     * @param {object | null} item Extracted item.
     * @param {number} index Stable item order.
     * @returns {object | null}
     */
    static #normalizeItem(item, index) {
        if (!item || typeof item !== 'object' || !item.geometry) return null

        return {
            priority: TYPE_PRIORITY[item.type] || 0,
            order: index,
            bounds: Geometry.boundsFromGeometry(item.geometry),
            ...item
        }
    }

    /**
     * Returns whether an item is visible under hit-test filters.
     * @param {object} item Interaction item.
     * @param {object} options Hit-test options.
     * @returns {boolean}
     */
    static #isVisibleCandidate(item, options) {
        const side = PcbInteractionIndex.#normalizeSide(options?.side)
        if (item.side !== 'both' && item.side !== side) return false

        const hiddenObjects = new Set(
            (Array.isArray(options?.hiddenObjects)
                ? options.hiddenObjects
                : []
            ).map(String)
        )
        if (
            hiddenObjects.has(item.objectKey) ||
            hiddenObjects.has(PLURAL_TYPE_KEYS[item.type] || item.type)
        ) {
            return false
        }

        const hiddenLayers = new Set(
            (Array.isArray(options?.hiddenLayers)
                ? options.hiddenLayers
                : []
            ).map(String)
        )
        return (
            !item.layerKeys?.length ||
            item.layerKeys.some((layerKey) => !hiddenLayers.has(layerKey))
        )
    }

    /**
     * Returns whether a geometry contains a point.
     * @param {object} geometry Geometry descriptor.
     * @param {{ x?: unknown, y?: unknown }} point Point.
     * @param {number} tolerance Hit-test tolerance.
     * @returns {boolean}
     */
    static #containsPoint(geometry, point, tolerance) {
        const testPoint = {
            x: Number(point?.x) || 0,
            y: Number(point?.y) || 0
        }
        const clearance = Geometry.clearanceBetweenGeometries(
            Geometry.circleGeometry(testPoint, 0),
            geometry
        )

        return clearance.clearance !== null && clearance.clearance <= tolerance
    }

    /**
     * Compares candidates by priority and stable extraction order.
     * @param {object} first First item.
     * @param {object} second Second item.
     * @returns {number}
     */
    static #compareCandidates(first, second) {
        return second.priority - first.priority || first.order - second.order
    }

    /**
     * Resolves layer keys for a source item.
     * @param {object} item Source item.
     * @returns {string[]}
     */
    static #layerKeys(item) {
        if (Array.isArray(item?.layers)) {
            return item.layers.map(String).filter(Boolean)
        }
        return String(item?.layer || '')
            .split(',')
            .map((layer) => layer.trim())
            .filter(Boolean)
    }

    /**
     * Resolves item side.
     * @param {object} item Source item.
     * @returns {'front' | 'back' | 'both'}
     */
    static #side(item) {
        if (item?.side === 'both') return 'both'
        if (item?.side === 'back') return 'back'
        if (item?.side === 'front') return 'front'
        const layers = PcbInteractionIndex.#layerKeys(item)
            .join(',')
            .toLowerCase()
        const hasBackLayer = layers.includes('b.')
        const hasFrontLayer = layers.includes('f.')
        if (hasBackLayer && hasFrontLayer) return 'both'
        if (hasBackLayer) return 'back'
        if (hasFrontLayer) return 'front'
        return 'both'
    }

    /**
     * Resolves a net name from common item fields.
     * @param {object} item Source item.
     * @returns {string}
     */
    static #netName(item) {
        return String(item?.netName || item?.net || '').trim()
    }

    /**
     * Resolves a pad display label.
     * @param {object} pad Pad.
     * @param {number} index Pad index.
     * @returns {string}
     */
    static #padLabel(pad, index) {
        const number = String(pad?.number || '').trim()
        return number || PcbInteractionIndex.#label('Pad', index)
    }

    /**
     * Resolves a stable component key for a pad.
     * @param {object} pad Pad.
     * @returns {string}
     */
    static #componentKeyForPad(pad) {
        return String(
            pad?.footprintReference ||
                pad?.reference ||
                PcbInteractionIndex.#referenceFromId(pad?.footprintId)
        )
    }

    /**
     * Resolves a stable component key for a footprint.
     * @param {object} footprint Footprint.
     * @returns {string}
     */
    static #componentKey(footprint) {
        return String(
            footprint?.reference ||
                footprint?.designator ||
                PcbInteractionIndex.#referenceFromId(footprint?.id)
        )
    }

    /**
     * Extracts a reference from a normalized footprint id.
     * @param {unknown} value Footprint id.
     * @returns {string}
     */
    static #referenceFromId(value) {
        const parts = String(value || '').split(':')
        return parts.length >= 2 ? parts[1] : ''
    }

    /**
     * Builds a stable fallback id.
     * @param {string} type Item type.
     * @param {object} source Source primitive.
     * @param {number} index Item index.
     * @returns {string}
     */
    static #itemId(type, source, index) {
        return String(source?.id || `${type}:${index}`)
    }

    /**
     * Builds a fallback label.
     * @param {string} base Label base.
     * @param {number} index Item index.
     * @returns {string}
     */
    static #label(base, index) {
        return `${base} ${index + 1}`
    }

    /**
     * Normalizes side input.
     * @param {unknown} side Side input.
     * @returns {'front' | 'back'}
     */
    static #normalizeSide(side) {
        return side === 'bottom' || side === 'back' ? 'back' : 'front'
    }
}
