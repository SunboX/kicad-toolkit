// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Builds route-highlight profile rows for KiCad PCB review metadata.
 */
export class KicadPcbReviewRouteHighlightProfileBuilder {
    /**
     * Builds route-highlight profiles for net classes, pairs, pair classes, and nets.
     * @param {object} routeAnalysis Route analysis model.
     * @returns {object[]}
     */
    static build(routeAnalysis = {}) {
        return [
            ...KicadPcbReviewRouteHighlightProfileBuilder.#netClassProfiles(
                routeAnalysis
            ),
            ...KicadPcbReviewRouteHighlightProfileBuilder.#differentialPairProfiles(
                routeAnalysis
            ),
            ...KicadPcbReviewRouteHighlightProfileBuilder.#differentialPairClassProfiles(
                routeAnalysis
            ),
            ...KicadPcbReviewRouteHighlightProfileBuilder.#netProfiles(
                routeAnalysis
            )
        ]
    }

    /**
     * Builds KiCad net-class highlight profiles.
     * @param {object} routeAnalysis Route analysis model.
     * @returns {object[]}
     */
    static #netClassProfiles(routeAnalysis) {
        return (routeAnalysis.classes || []).map((classRow) =>
            KicadPcbReviewRouteHighlightProfileBuilder.#highlightProfile({
                selectorKind: 'net-class',
                keyPrefix: 'highlight-net-class-',
                name: classRow.name,
                netNames: classRow.netNames || [],
                routeAnalysis
            })
        )
    }

    /**
     * Builds differential-pair highlight profiles.
     * @param {object} routeAnalysis Route analysis model.
     * @returns {object[]}
     */
    static #differentialPairProfiles(routeAnalysis) {
        return (routeAnalysis.differentialPairs || []).map((pair) =>
            KicadPcbReviewRouteHighlightProfileBuilder.#highlightProfile({
                selectorKind: 'differential-pair',
                keyPrefix: 'highlight-diff-pair-',
                name: pair.name,
                netNames: [pair.positiveNetName, pair.negativeNetName].filter(
                    Boolean
                ),
                routeAnalysis
            })
        )
    }

    /**
     * Builds differential-pair class highlight profiles.
     * @param {object} routeAnalysis Route analysis model.
     * @returns {object[]}
     */
    static #differentialPairClassProfiles(routeAnalysis) {
        const classNames = new Map()
        for (const pair of routeAnalysis.differentialPairs || []) {
            for (const className of pair.classes || []) {
                if (!classNames.has(className))
                    classNames.set(className, new Set())
                const netNames = classNames.get(className)
                for (const netName of [
                    pair.positiveNetName,
                    pair.negativeNetName
                ]) {
                    if (netName) netNames.add(netName)
                }
            }
        }

        return [...classNames.entries()]
            .sort(([left], [right]) => localeCompare(left, right))
            .map(([name, netNames]) =>
                KicadPcbReviewRouteHighlightProfileBuilder.#highlightProfile({
                    selectorKind: 'differential-pair-class',
                    keyPrefix: 'highlight-diff-pair-class-',
                    name,
                    netNames: [...netNames],
                    routeAnalysis
                })
            )
    }

    /**
     * Builds scalar net highlight profiles.
     * @param {object} routeAnalysis Route analysis model.
     * @returns {object[]}
     */
    static #netProfiles(routeAnalysis) {
        return (routeAnalysis.byNet || []).map((net) =>
            KicadPcbReviewRouteHighlightProfileBuilder.#highlightProfile({
                selectorKind: 'net',
                keyPrefix: 'highlight-net-',
                name: netName(net),
                netNames: [netName(net)],
                routeAnalysis
            })
        )
    }

    /**
     * Builds one route-highlight profile.
     * @param {{ selectorKind: string, keyPrefix: string, name: string, netNames: string[], routeAnalysis: object }} options Profile options.
     * @returns {object}
     */
    static #highlightProfile(options) {
        const netNames = sortedStrings(options.netNames || [])
        const layerGroups =
            KicadPcbReviewRouteHighlightProfileBuilder.#layerGroups(
                options.routeAnalysis,
                netNames
            )

        return stripEmpty({
            key: options.keyPrefix + slug(options.name),
            selectorKind: options.selectorKind,
            name: options.name,
            netNames,
            minRoutedLengthMil:
                layerGroups.length > 0
                    ? Math.min(
                          ...layerGroups.map((group) =>
                              Number(group.routedLengthMil || 0)
                          )
                      )
                    : 0,
            layerGroups,
            style: highlightStyle(options.selectorKind)
        })
    }

    /**
     * Builds per-layer route-highlight groups.
     * @param {object} routeAnalysis Route analysis model.
     * @param {string[]} netNames Net names.
     * @returns {object[]}
     */
    static #layerGroups(routeAnalysis, netNames) {
        const groupsByLayer = new Map()
        for (const net of netsByName(routeAnalysis, netNames)) {
            for (const participation of net.layerParticipation || []) {
                const layerKey = String(participation.layerKey || '').trim()
                if (!layerKey) continue
                if (!groupsByLayer.has(layerKey)) {
                    groupsByLayer.set(layerKey, {
                        layerKey,
                        primitiveKeys: new Set(),
                        routedLengthMil: 0
                    })
                }
                const group = groupsByLayer.get(layerKey)
                group.routedLengthMil += Number(
                    participation.totalLengthMil || 0
                )
                for (const routeGroup of net.connectedRouteGroups || []) {
                    if (!(routeGroup.layerKeys || []).includes(layerKey)) {
                        continue
                    }
                    for (const primitiveKey of routeGroup.primitiveKeys || []) {
                        group.primitiveKeys.add(primitiveKey)
                    }
                }
            }
        }

        return [...groupsByLayer.values()]
            .map((group) => ({
                layerKey: group.layerKey,
                primitiveKeys: sortedStrings([...group.primitiveKeys]),
                routedLengthMil: round(group.routedLengthMil)
            }))
            .sort((left, right) => localeCompare(left.layerKey, right.layerKey))
    }
}

/**
 * Resolves net route rows by name.
 * @param {object} routeAnalysis Route analysis model.
 * @param {string[]} netNames Net names.
 * @returns {object[]}
 */
function netsByName(routeAnalysis, netNames) {
    const wanted = new Set(netNames || [])
    return (routeAnalysis.byNet || []).filter((net) => wanted.has(netName(net)))
}

/**
 * Resolves a route-analysis net name.
 * @param {object} net Net row.
 * @returns {string}
 */
function netName(net) {
    return String(net?.netName || net?.name || '').trim()
}

/**
 * Returns deterministic highlight style metadata.
 * @param {string} selectorKind Selector kind.
 * @returns {{ highlightColor: string, contextColor: string }}
 */
function highlightStyle(selectorKind) {
    if (selectorKind === 'differential-pair') {
        return { highlightColor: '#dc2626', contextColor: '#475569' }
    }
    if (selectorKind === 'differential-pair-class') {
        return { highlightColor: '#7c3aed', contextColor: '#475569' }
    }
    if (selectorKind === 'net-class') {
        return { highlightColor: '#d97706', contextColor: '#475569' }
    }
    return { highlightColor: '#2563eb', contextColor: '#475569' }
}

/**
 * Sorts and deduplicates strings naturally.
 * @param {string[]} values Source values.
 * @returns {string[]}
 */
function sortedStrings(values) {
    return [...new Set((values || []).filter(Boolean))].sort(localeCompare)
}

/**
 * Converts a value to a deterministic lowercase key segment.
 * @param {unknown} value Source value.
 * @returns {string}
 */
function slug(value) {
    return (
        String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/gu, '-')
            .replace(/^-+|-+$/gu, '') || 'item'
    )
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

/**
 * Rounds numeric values.
 * @param {unknown} value Candidate value.
 * @returns {number}
 */
function round(value) {
    const number = Number(value || 0)
    return Number.isFinite(number) ? Number(number.toFixed(2)) : 0
}

/**
 * Removes empty optional object fields.
 * @param {Record<string, unknown>} value Candidate object.
 * @returns {Record<string, unknown>}
 */
function stripEmpty(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(([, entryValue]) => {
            return (
                entryValue !== undefined &&
                entryValue !== null &&
                entryValue !== ''
            )
        })
    )
}
