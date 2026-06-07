// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadPcbReviewDrillMetadataBuilder } from './KicadPcbReviewDrillMetadataBuilder.mjs'
import { KicadPcbReviewPolygonRealizationBuilder } from './KicadPcbReviewPolygonRealizationBuilder.mjs'
import { KicadPcbReviewRouteHighlightProfileBuilder } from './KicadPcbReviewRouteHighlightProfileBuilder.mjs'

/**
 * Builds PCB review metadata for KiCad route and assembly workflows.
 */
export class KicadPcbReviewMetadataBuilder {
    static SCHEMA = 'kicad-toolkit.pcb.review-metadata.a1'

    /**
     * Builds a normalized review metadata sidecar.
     * @param {{ routeAnalysis?: object, embeddedModels?: object[], componentBodies?: object[] }} pcb Review context.
     * @returns {object}
     */
    static build(pcb = {}) {
        const routeGroupRows = routeGroups(pcb.routeAnalysis || {})
        const routeHighlightProfileRows =
            KicadPcbReviewRouteHighlightProfileBuilder.build(
                pcb.routeAnalysis || {}
            )
        const polygonRealizationRows =
            KicadPcbReviewPolygonRealizationBuilder.build(pcb)
        const drillReview = KicadPcbReviewDrillMetadataBuilder.build(pcb)
        const boardAssemblyViewRows = boardAssemblyViews(
            pcb.embeddedModels || [],
            pcb.componentBodies || []
        )

        return {
            schema: KicadPcbReviewMetadataBuilder.SCHEMA,
            summary: {
                routeGroupCount: routeGroupRows.length,
                boardAssemblyViewCount: boardAssemblyViewRows.length,
                polygonRealizationCount: polygonRealizationRows.length,
                routeHighlightProfileCount: routeHighlightProfileRows.length,
                drillOverlayCount: drillReview.overlays.length
            },
            routeGroups: routeGroupRows,
            routeHighlightProfiles: routeHighlightProfileRows,
            polygonRealizations: polygonRealizationRows,
            drillReview,
            boardAssemblyViews: boardAssemblyViewRows,
            indexes: indexes(
                routeGroupRows,
                routeHighlightProfileRows,
                polygonRealizationRows,
                drillReview,
                boardAssemblyViewRows,
                pcb.routeAnalysis || {}
            )
        }
    }
}

/**
 * Builds route highlight groups from route analysis.
 * @param {object} routeAnalysis Route analysis model.
 * @returns {object[]}
 */
function routeGroups(routeAnalysis) {
    return [
        ...classGroups(routeAnalysis),
        ...differentialPairGroups(routeAnalysis)
    ]
}

/**
 * Builds KiCad net-class route groups.
 * @param {object} routeAnalysis Route analysis model.
 * @returns {object[]}
 */
function classGroups(routeAnalysis) {
    return (routeAnalysis.classes || []).map((classRow) =>
        stripEmpty({
            key: 'route-class-' + slug(classRow.name),
            kind: 'net-class',
            name: classRow.name,
            netNames: classRow.netNames || [],
            layerKeys: layerKeysForNets(routeAnalysis, classRow.netNames || []),
            primitiveKeys: primitiveKeysForNets(
                routeAnalysis,
                classRow.netNames || []
            ),
            totalLengthMil: classRow.totalLengthMil
        })
    )
}

/**
 * Builds differential-pair groups only when callers supplied explicit pairs.
 * @param {object} routeAnalysis Route analysis model.
 * @returns {object[]}
 */
function differentialPairGroups(routeAnalysis) {
    return (routeAnalysis.differentialPairs || []).map((pair) => {
        const netNames = [pair.positiveNetName, pair.negativeNetName].filter(
            Boolean
        )

        return stripEmpty({
            key: 'route-diff-pair-' + slug(pair.name),
            kind: 'differential-pair',
            name: pair.name,
            netNames,
            layerKeys: layerKeysForNets(routeAnalysis, netNames),
            primitiveKeys: primitiveKeysForNets(routeAnalysis, netNames),
            totalLengthMil: round(
                Number(pair.positiveLengthMil || 0) +
                    Number(pair.negativeLengthMil || 0)
            ),
            skewLengthMil: pair.skewLengthMil,
            classes: pair.classes || []
        })
    })
}

/**
 * Builds board assembly view candidates from unreferenced model payloads.
 * @param {object[]} embeddedModels Embedded model rows.
 * @param {object[]} componentBodies Component body rows.
 * @returns {object[]}
 */
function boardAssemblyViews(embeddedModels, componentBodies) {
    const referencedModelKeys = modelReferenceKeys(componentBodies)

    return (embeddedModels || [])
        .filter((model) => {
            return !modelKeys(model).some((key) => referencedModelKeys.has(key))
        })
        .map((model, index) =>
            stripEmpty({
                key:
                    'board-assembly-' + index + '-' + slug(model.name || index),
                name: model.name,
                format: model.format,
                sourcePath: model.path || model.sourcePath,
                modelId: model.id,
                reason: 'embedded model is not referenced by component bodies'
            })
        )
}

/**
 * Builds lookup indexes.
 * @param {object[]} routeGroups Route groups.
 * @param {object[]} routeHighlightProfiles Route-highlight profiles.
 * @param {object[]} polygonRealizations Polygon realization rows.
 * @param {{ overlays: object[] }} drillReview Drill review rows.
 * @param {object[]} boardAssemblyViews Assembly view rows.
 * @param {object} routeAnalysis Route analysis model.
 * @returns {object}
 */
function indexes(
    routeGroups,
    routeHighlightProfiles,
    polygonRealizations,
    drillReview,
    boardAssemblyViews,
    routeAnalysis
) {
    const routeGroupsByName = {}
    const routeHighlightProfilesByName = {}
    const polygonRealizationsByKey = {}
    const drillOverlaysByOwnerKey = {}
    const boardAssemblyViewsByName = {}

    routeGroups.forEach((group, index) => {
        if (group.name) routeGroupsByName[group.name] = index
    })
    routeHighlightProfiles.forEach((profile, index) => {
        if (profile.name) routeHighlightProfilesByName[profile.name] = index
    })
    polygonRealizations.forEach((realization, index) => {
        polygonRealizationsByKey[realization.key] = index
    })
    for (const [index, overlay] of (drillReview.overlays || []).entries()) {
        if (overlay.ownerKey) drillOverlaysByOwnerKey[overlay.ownerKey] = index
    }
    boardAssemblyViews.forEach((view, index) => {
        if (view.name) boardAssemblyViewsByName[view.name] = index
    })

    return {
        routeGroupsByName,
        routeHighlightProfilesByName,
        primitiveKeysByNet: primitiveKeysByNet(routeAnalysis),
        polygonRealizationsByKey,
        drillOverlaysByOwnerKey,
        boardAssemblyViewsByName
    }
}

/**
 * Builds primitive-key lookup arrays by net name.
 * @param {object} routeAnalysis Route analysis model.
 * @returns {Record<string, string[]>}
 */
function primitiveKeysByNet(routeAnalysis) {
    const entries = {}
    for (const net of routeAnalysis.byNet || []) {
        entries[netName(net)] = primitiveKeys(net)
    }
    return Object.fromEntries(
        Object.entries(entries).sort(([left], [right]) =>
            localeCompare(left, right)
        )
    )
}

/**
 * Returns layer keys participating in a net list.
 * @param {object} routeAnalysis Route analysis model.
 * @param {string[]} netNames Net names.
 * @returns {string[]}
 */
function layerKeysForNets(routeAnalysis, netNames) {
    return sortedStrings(
        netsByName(routeAnalysis, netNames).flatMap((net) => net.layers || [])
    )
}

/**
 * Returns primitive keys participating in a net list.
 * @param {object} routeAnalysis Route analysis model.
 * @param {string[]} netNames Net names.
 * @returns {string[]}
 */
function primitiveKeysForNets(routeAnalysis, netNames) {
    return sortedStrings(
        netsByName(routeAnalysis, netNames).flatMap((net) => primitiveKeys(net))
    )
}

/**
 * Resolves route-analysis net rows by name.
 * @param {object} routeAnalysis Route analysis model.
 * @param {string[]} names Net names.
 * @returns {object[]}
 */
function netsByName(routeAnalysis, names) {
    const wanted = new Set(names || [])
    return (routeAnalysis.byNet || []).filter((net) => wanted.has(netName(net)))
}

/**
 * Collects primitive keys from a route-analysis net row.
 * @param {object} net Net row.
 * @returns {string[]}
 */
function primitiveKeys(net) {
    return sortedStrings([
        ...(net.connectedRouteGroups || []).flatMap(
            (group) => group.primitiveKeys || []
        ),
        ...(net.primitives || []).map((primitive) => primitive.primitiveKey),
        ...(net.vias || []).map((via) => via.primitiveKey)
    ])
}

/**
 * Resolves a route-analysis net name from Altium or KiCad row shapes.
 * @param {object} net Net row.
 * @returns {string}
 */
function netName(net) {
    return String(net?.netName || net?.name || '').trim()
}

/**
 * Collects model reference keys from component bodies.
 * @param {object[]} componentBodies Component body rows.
 * @returns {Set<string>}
 */
function modelReferenceKeys(componentBodies) {
    const keys = new Set()
    for (const componentBody of componentBodies || []) {
        for (const key of modelKeys(componentBody)) keys.add(key)
    }
    return keys
}

/**
 * Builds comparable model identity keys.
 * @param {object} value Model or body row.
 * @returns {string[]}
 */
function modelKeys(value) {
    return [
        value?.id,
        value?.modelId,
        value?.checksum,
        value?.name,
        value?.path
    ]
        .map((entry) => String(entry ?? '').trim())
        .filter(Boolean)
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
