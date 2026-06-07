// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const defaultPositionMode = 'kicad-footprint-origin'
const padAnchorCenterMode = 'pad-anchor-center'

/**
 * Resolves KiCad PCB pick-and-place coordinates from footprint and pad anchors.
 */
export class KicadPcbPickPlacePositionResolver {
    /**
     * Builds the public PnP model with default and alternate coordinate modes.
     * @param {object[]} components Normalized component rows.
     * @param {object[]} padsOrGroups Normalized pad rows or component primitive groups.
     * @param {object} [options] Resolver options.
     * @returns {object}
     */
    static buildModel(components, padsOrGroups, options = {}) {
        const units = {
            coordinate: 'mil',
            angle: 'deg'
        }

        return {
            units,
            positionMode: defaultPositionMode,
            entries: KicadPcbPickPlacePositionResolver.buildEntries(
                components,
                padsOrGroups,
                defaultPositionMode,
                options
            ),
            modes: {
                padAnchorCenter: {
                    units,
                    positionMode: padAnchorCenterMode,
                    entries: KicadPcbPickPlacePositionResolver.buildEntries(
                        components,
                        padsOrGroups,
                        padAnchorCenterMode,
                        options
                    )
                }
            }
        }
    }

    /**
     * Builds PnP entries for one coordinate mode.
     * @param {object[]} components Normalized component rows.
     * @param {object[]} padsOrGroups Normalized pad rows or component primitive groups.
     * @param {string} mode Public coordinate mode.
     * @param {object} [options] Resolver options.
     * @returns {object[]}
     */
    static buildEntries(components, padsOrGroups, mode, options = {}) {
        const normalizedMode =
            KicadPcbPickPlacePositionResolver.normalizePositionMode(mode)
        const padsByComponent =
            KicadPcbPickPlacePositionResolver.#buildPadLookup(padsOrGroups)

        return (components || [])
            .filter((component) => component?.excludeFromPositionFiles !== true)
            .map((component) => {
                return KicadPcbPickPlacePositionResolver.#buildEntry(
                    component,
                    padsByComponent,
                    normalizedMode,
                    options
                )
            })
    }

    /**
     * Normalizes one public PnP coordinate-mode token.
     * @param {string | null | undefined} mode Candidate mode.
     * @returns {'kicad-footprint-origin' | 'pad-anchor-center'}
     */
    static normalizePositionMode(mode) {
        const normalized = String(mode || defaultPositionMode)
            .trim()
            .toLowerCase()
            .replace(/_/gu, '-')

        if (
            normalized === 'pad-anchor-center' ||
            normalized === 'pad-center' ||
            normalized === 'pad-anchor' ||
            normalized === 'anchor-center'
        ) {
            return padAnchorCenterMode
        }

        return defaultPositionMode
    }

    /**
     * Builds one PnP entry.
     * @param {object} component Component row.
     * @param {Map<string, object[]>} padsByComponent Pad lookup.
     * @param {'kicad-footprint-origin' | 'pad-anchor-center'} mode Mode.
     * @param {object} options Resolver options.
     * @returns {object}
     */
    static #buildEntry(component, padsByComponent, mode, options) {
        const footprintOrigin = {
            x: number(component.x),
            y: number(component.y)
        }
        const pads = padsForComponent(component, padsByComponent)
        const padAnchors = padAnchorPoints(pads)
        const padCenter =
            mode === padAnchorCenterMode
                ? padAnchorBoundsCenter(padAnchors)
                : null
        const position = padCenter || {
            x: footprintOrigin.x,
            y: footprintOrigin.y,
            source: 'footprint-origin'
        }

        return {
            designator: String(component.designator || ''),
            pattern: String(
                component.pattern ||
                    component.footprintName ||
                    component.source ||
                    ''
            ),
            layer: String(component.layer || ''),
            rotation: round(number(component.rotation ?? options.rotation)),
            x: round(position.x),
            y: round(position.y),
            footprintOriginX: round(footprintOrigin.x),
            footprintOriginY: round(footprintOrigin.y),
            padAnchorCount: padAnchors.length,
            positionSource: position.source
        }
    }

    /**
     * Builds a pad lookup keyed by several component identifiers.
     * @param {object[]} padsOrGroups Pad rows or component primitive groups.
     * @returns {Map<string, object[]>}
     */
    static #buildPadLookup(padsOrGroups) {
        const lookup = new Map()

        for (const item of padsOrGroups || []) {
            const pads = Array.isArray(item?.pads) ? item.pads : [item]
            for (const pad of pads) {
                for (const key of componentKeysForPad(pad, item)) {
                    if (!lookup.has(key)) lookup.set(key, [])
                    lookup.get(key).push(pad)
                }
            }
        }

        return lookup
    }
}

/**
 * Gets pads owned by one component.
 * @param {object} component Component row.
 * @param {Map<string, object[]>} lookup Pad lookup.
 * @returns {object[]}
 */
function padsForComponent(component, lookup) {
    const keys = componentKeys(component)
    const pads = []
    const seen = new Set()

    for (const key of keys) {
        for (const pad of lookup.get(key) || []) {
            const identity = pad.id || pad.primitiveKey || JSON.stringify(pad)
            if (seen.has(identity)) continue
            seen.add(identity)
            pads.push(pad)
        }
    }

    return pads
}

/**
 * Builds component keys from a component row.
 * @param {object} component Component row.
 * @returns {string[]}
 */
function componentKeys(component) {
    return [
        key('index', component?.componentIndex),
        key('footprintId', component?.footprintId),
        key('footprintReference', component?.designator),
        key('designator', component?.designator)
    ].filter(Boolean)
}

/**
 * Builds component keys from a pad and optional group row.
 * @param {object} pad Pad row.
 * @param {object} group Optional primitive group.
 * @returns {string[]}
 */
function componentKeysForPad(pad, group) {
    return [
        key('index', pad?.componentIndex ?? group?.componentIndex),
        key('footprintId', pad?.footprintId ?? group?.footprintId),
        key(
            'footprintReference',
            pad?.footprintReference ?? group?.footprintReference
        ),
        key('designator', pad?.footprintReference ?? group?.designator)
    ].filter(Boolean)
}

/**
 * Builds one lookup key.
 * @param {string} prefix Key prefix.
 * @param {unknown} value Key value.
 * @returns {string}
 */
function key(prefix, value) {
    const normalized = String(value ?? '').trim()
    return normalized ? prefix + ':' + normalized : ''
}

/**
 * Returns finite pad anchor points.
 * @param {object[]} pads Pad rows.
 * @returns {{ x: number, y: number }[]}
 */
function padAnchorPoints(pads) {
    return (pads || [])
        .map((pad) => ({
            x: Number(pad?.x),
            y: Number(pad?.y)
        }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
}

/**
 * Resolves the center of owned pad-anchor bounds.
 * @param {{ x: number, y: number }[]} padAnchors Pad anchors.
 * @returns {{ x: number, y: number, source: string } | null}
 */
function padAnchorBoundsCenter(padAnchors) {
    if (!padAnchors.length) return null
    const xs = padAnchors.map((point) => point.x)
    const ys = padAnchors.map((point) => point.y)

    return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
        source: 'pad-anchor-center'
    }
}

/**
 * Coerces a numeric value.
 * @param {unknown} value Candidate value.
 * @returns {number}
 */
function number(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Rounds one coordinate.
 * @param {unknown} value Candidate value.
 * @returns {number}
 */
function round(value) {
    const parsed = Number(value || 0)
    return Number.isFinite(parsed) ? Number(parsed.toFixed(6)) : 0
}
