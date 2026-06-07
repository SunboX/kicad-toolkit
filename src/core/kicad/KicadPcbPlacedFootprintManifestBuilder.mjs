// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Builds read-only extraction manifests for placed KiCad PCB footprints.
 */
export class KicadPcbPlacedFootprintManifestBuilder {
    static SCHEMA = 'kicad-toolkit.pcb.placed-footprint-extraction.a1'

    /**
     * Builds a placed-footprint extraction manifest.
     * @param {{ fileName?: string, pcb?: object, components?: object[] }} context Manifest context or parsed document.
     * @returns {object}
     */
    static build(context = {}) {
        const pcb = context.pcb || context
        const components = pcb.components || context.components || []
        const groups = footprintGroups(pcb, components)
        const outputs = groups.map((group, index) =>
            outputDescriptor(context, group, index)
        )
        const embeddedAssetCount = outputs.reduce((total, output) => {
            return total + output.embeddedAssets.length
        }, 0)

        return {
            schema: KicadPcbPlacedFootprintManifestBuilder.SCHEMA,
            sourceDocument: String(context.fileName || pcb.fileName || ''),
            summary: {
                componentCount: components.length,
                extractableFootprintCount: outputs.length,
                embeddedAssetCount
            },
            outputs,
            indexes: indexes(outputs)
        }
    }
}

/**
 * Builds extraction groups from raw KiCad footprints or normalized components.
 * @param {object} pcb Normalized PCB model.
 * @param {object[]} components Component rows.
 * @returns {object[]}
 */
function footprintGroups(pcb, components) {
    const rawFootprints = pcb.kicadBoard?.footprints || []
    if (rawFootprints.length) {
        return rawFootprints.map((footprint, index) =>
            rawFootprintGroup(pcb, footprint, index)
        )
    }

    if ((pcb.componentPrimitiveGroups || []).length) {
        return pcb.componentPrimitiveGroups || []
    }

    return (components || []).map((component, index) =>
        normalizedComponentGroup(pcb, component, index)
    )
}

/**
 * Builds one group from a raw KiCad footprint.
 * @param {object} pcb Normalized PCB model.
 * @param {object} footprint Raw KiCad footprint.
 * @param {number} index Footprint index.
 * @returns {object}
 */
function rawFootprintGroup(pcb, footprint, index) {
    const component =
        (pcb.components || []).find((candidate) => {
            return (
                String(candidate.footprintId || '') ===
                    String(footprint.id || '') ||
                String(candidate.designator || '') ===
                    String(footprint.reference || '')
            )
        }) || {}

    return {
        componentIndex: Number(component.componentIndex ?? index),
        designator: footprint.reference || component.designator || '',
        pattern: footprint.libraryName || component.pattern || '',
        pads: footprint.pads || [],
        tracks: [],
        arcs: [],
        drawings: footprint.drawings || [],
        vias: [],
        zones: [],
        texts: footprint.texts || [],
        models: footprint.models || [],
        kicadFootprint: footprint
    }
}

/**
 * Builds one group from normalized component ownership fields.
 * @param {object} pcb Normalized PCB model.
 * @param {object} component Component row.
 * @param {number} index Component index.
 * @returns {object}
 */
function normalizedComponentGroup(pcb, component, index) {
    return {
        componentIndex: Number(component.componentIndex ?? index),
        designator: component.designator || '',
        pattern: component.pattern || component.footprintName || '',
        pads: ownedPads(pcb.pads || [], component),
        tracks: ownedPrimitives(pcb.tracks || [], component),
        arcs: ownedPrimitives(pcb.arcs || [], component),
        drawings: ownedPrimitives(pcb.drawings || [], component),
        vias: ownedPrimitives(pcb.vias || [], component),
        zones: ownedPrimitives(
            [
                ...(pcb.polygons || []),
                ...(pcb.fills || []),
                ...(pcb.regions || []),
                ...(pcb.boardRegions || [])
            ],
            component
        ),
        texts: ownedPrimitives(pcb.texts || [], component),
        models: [
            ...(component.models || []),
            ...(component.modelPath ? [{ path: component.modelPath }] : [])
        ]
    }
}

/**
 * Builds one placed-footprint output descriptor.
 * @param {object} context Original context.
 * @param {object} group Footprint primitive group.
 * @param {number} index Output index.
 * @returns {object}
 */
function outputDescriptor(context, group, index) {
    const pcb = context.pcb || context
    const components = pcb.components || context.components || []
    const component =
        components.find((candidate) => {
            return (
                Number(candidate.componentIndex) ===
                Number(group.componentIndex)
            )
        }) || {}
    const designator = group.designator || component.designator || ''
    const pattern = group.pattern || component.pattern || ''
    const footprintKey =
        'footprint-extract-' +
        index +
        '-' +
        slug([designator, pattern].filter(Boolean).join('-') || index)

    return {
        kind: 'placed-footprint',
        footprintKey,
        designator,
        pattern,
        componentIndex: Number(group.componentIndex),
        outputLibraryKey: 'pcb-extract/' + footprintKey + '.kicad_mod',
        renderManifestKey: 'pcb-extract/' + footprintKey + '.render.json',
        primitiveCounts: primitiveCounts(group),
        layers: layers(group),
        embeddedAssets: embeddedAssets(group),
        diagnostics: diagnostics(group)
    }
}

/**
 * Counts footprint-owned primitive families.
 * @param {object} group Footprint group.
 * @returns {object}
 */
function primitiveCounts(group) {
    return {
        pads: (group.pads || []).length,
        tracks: (group.tracks || []).length,
        arcs: (group.arcs || []).length,
        drawings: (group.drawings || []).length,
        vias: (group.vias || []).length,
        zones: (group.zones || []).length,
        texts: (group.texts || []).length,
        models: (group.models || []).length
    }
}

/**
 * Builds layer descriptors touched by one footprint.
 * @param {object} group Footprint group.
 * @returns {object[]}
 */
function layers(group) {
    const layerMap = new Map()
    for (const primitive of primitives(group)) {
        for (const layer of layerDescriptors(primitive)) {
            layerMap.set(layer.layerKey, layer)
        }
    }
    return [...layerMap.values()].sort((left, right) =>
        localeCompare(left.layerKey, right.layerKey)
    )
}

/**
 * Collects model references as embedded/external asset descriptors.
 * @param {object} group Footprint group.
 * @returns {object[]}
 */
function embeddedAssets(group) {
    return dedupe(
        (group.models || [])
            .map((model, index) => {
                const name = String(model?.name || basename(model?.path)).trim()
                const path = String(model?.path || model?.sourcePath || '')
                return stripUndefined({
                    key: model?.id || path || name || 'model-' + index,
                    kind: 'model-ref',
                    format: extension(path || name),
                    sourcePath: path || undefined,
                    name: name || undefined
                })
            })
            .filter((asset) => asset.key)
    )
}

/**
 * Builds extraction diagnostics for one group.
 * @param {object} group Footprint group.
 * @returns {object[]}
 */
function diagnostics(group) {
    if (primitives(group).length || (group.models || []).length) return []

    return [
        {
            code: 'pcb-footprint-extract.empty-geometry',
            severity: 'warning',
            message: 'Placed component has no owned footprint geometry.'
        }
    ]
}

/**
 * Builds manifest lookup indexes.
 * @param {object[]} outputs Output descriptors.
 * @returns {object}
 */
function indexes(outputs) {
    const outputsByDesignator = {}
    const outputsByPattern = {}

    outputs.forEach((output, index) => {
        if (output.designator) outputsByDesignator[output.designator] = index
        if (output.pattern) {
            outputsByPattern[output.pattern] ||= []
            outputsByPattern[output.pattern].push(index)
        }
    })

    return { outputsByDesignator, outputsByPattern }
}

/**
 * Returns pads owned by one component.
 * @param {object[]} pads Pad rows.
 * @param {object} component Component row.
 * @returns {object[]}
 */
function ownedPads(pads, component) {
    return (pads || []).filter((pad) => {
        return (
            same(pad.componentIndex, component.componentIndex) ||
            same(pad.footprintId, component.footprintId) ||
            same(pad.footprintReference, component.designator)
        )
    })
}

/**
 * Returns primitives owned by one component.
 * @param {object[]} primitives Primitive rows.
 * @param {object} component Component row.
 * @returns {object[]}
 */
function ownedPrimitives(primitives, component) {
    return (primitives || []).filter((primitive) => {
        return (
            same(primitive.componentIndex, component.componentIndex) ||
            same(primitive.ownerId, component.footprintId) ||
            same(primitive.ownerIndex, component.footprintId) ||
            same(primitive.footprintReference, component.designator) ||
            ownerReferencesDesignator(
                primitive.ownerId,
                component.designator
            ) ||
            ownerReferencesDesignator(
                primitive.ownerIndex,
                component.designator
            )
        )
    })
}

/**
 * Returns whether an owner id contains a KiCad footprint designator segment.
 * @param {unknown} ownerId Owner id.
 * @param {unknown} designator Component designator.
 * @returns {boolean}
 */
function ownerReferencesDesignator(ownerId, designator) {
    const owner = String(ownerId || '')
    const reference = String(designator || '')
    return Boolean(reference && owner.includes(':' + reference + ':'))
}

/**
 * Returns all geometry primitives from a group.
 * @param {object} group Footprint group.
 * @returns {object[]}
 */
function primitives(group) {
    return [
        ...(group.pads || []),
        ...(group.tracks || []),
        ...(group.arcs || []),
        ...(group.drawings || []),
        ...(group.vias || []),
        ...(group.zones || []),
        ...(group.texts || [])
    ]
}

/**
 * Builds normalized layer descriptors for one primitive.
 * @param {object} primitive Primitive row.
 * @returns {object[]}
 */
function layerDescriptors(primitive) {
    const layers = Array.isArray(primitive?.layers) ? primitive.layers : []
    const explicit = [
        ...layers,
        primitive?.layerKey,
        primitive?.layer,
        primitive?.layerName
    ]
        .map((layer) => String(layer || '').trim())
        .filter(Boolean)

    return [...new Set(explicit)]
        .map((layer) => ({ layerKey: layer, displayName: layer }))
        .filter((layer) => layer.layerKey)
}

/**
 * Deduplicates objects by JSON identity.
 * @param {object[]} rows Candidate rows.
 * @returns {object[]}
 */
function dedupe(rows) {
    const seen = new Set()
    const deduped = []
    for (const row of rows || []) {
        const key = JSON.stringify(row)
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(row)
    }
    return deduped
}

/**
 * Compares two non-empty values.
 * @param {unknown} left First value.
 * @param {unknown} right Second value.
 * @returns {boolean}
 */
function same(left, right) {
    return (
        left !== null &&
        left !== undefined &&
        left !== '' &&
        right !== null &&
        right !== undefined &&
        right !== '' &&
        String(left) === String(right)
    )
}

/**
 * Returns a slash-normalized basename.
 * @param {unknown} path Path value.
 * @returns {string}
 */
function basename(path) {
    return String(path || '')
        .replace(/\\/g, '/')
        .split('/')
        .at(-1)
}

/**
 * Returns a lowercase file extension without dot.
 * @param {unknown} path Path value.
 * @returns {string}
 */
function extension(path) {
    const match = String(path || '').match(/\.([^.\\/]+)$/u)
    return match ? match[1].toLowerCase() : ''
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
 * Removes undefined fields.
 * @param {Record<string, unknown>} value Candidate object.
 * @returns {Record<string, unknown>}
 */
function stripUndefined(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(
            ([, entryValue]) => entryValue !== undefined
        )
    )
}
