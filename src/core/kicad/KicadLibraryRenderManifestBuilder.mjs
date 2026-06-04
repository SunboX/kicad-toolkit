// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const manifestSchema = 'kicad-toolkit.library.render-manifest.a1'

/**
 * Builds deterministic render/export manifests for KiCad library models.
 */
export class KicadLibraryRenderManifestBuilder {
    /**
     * Builds a PCB footprint-library render manifest.
     * @param {object} library Parsed footprint library.
     * @returns {{ schema: string, libraryKind: string, outputs: object[], assets: object[], embeddedAssets: object[] }}
     */
    static buildPcbLibraryManifest(library) {
        const footprints = library?.pcbLibrary?.footprints || []
        const outputs = footprints.map(footprintOutput)

        return {
            schema: manifestSchema,
            libraryKind: 'pcb-footprints',
            outputs,
            assets: dedupeAssets(outputs.flatMap((output) => output.assets)),
            embeddedAssets: dedupeAssets(
                outputs.flatMap((output) => output.embeddedAssets)
            )
        }
    }

    /**
     * Builds a schematic-symbol library render manifest.
     * @param {object} library Parsed symbol library.
     * @returns {{ schema: string, libraryKind: string, outputs: object[], embeddedAssets: object[] }}
     */
    static buildSchematicLibraryManifest(library) {
        const symbols =
            library?.schematicLibrary?.symbols || library?.symbols || []
        const outputs = symbols.flatMap(symbolOutputs)

        return {
            schema: manifestSchema,
            libraryKind: 'schematic-symbols',
            outputs,
            embeddedAssets: dedupeAssets(
                outputs.flatMap((output) => output.embeddedAssets)
            )
        }
    }

    /**
     * Builds a KiCad design-block library render manifest.
     * @param {object} library Parsed design-block library.
     * @returns {{ schema: string, libraryKind: string, outputs: object[], embeddedAssets: object[] }}
     */
    static buildDesignBlockLibraryManifest(library) {
        const blocks = library?.blocks || []
        const outputs = blocks.map(designBlockOutput)

        return {
            schema: manifestSchema,
            libraryKind: 'design-blocks',
            outputs,
            embeddedAssets: []
        }
    }

    /**
     * Builds a manifest from a mixed KiCad library index.
     * @param {object} index Parsed library index.
     * @returns {{ schema: string, libraryKind: string, outputs: object[], assets: object[], embeddedAssets: object[] }}
     */
    static buildLibraryIndexManifest(index) {
        const outputs = (index?.items || [])
            .map(indexItemOutput)
            .filter(Boolean)

        return {
            schema: manifestSchema,
            libraryKind: 'library-index',
            outputs,
            assets: dedupeAssets(outputs.flatMap((output) => output.assets)),
            embeddedAssets: dedupeAssets(
                outputs.flatMap((output) => output.embeddedAssets)
            )
        }
    }
}

/**
 * Builds one footprint output descriptor.
 * @param {object} footprint Footprint row.
 * @param {number} footprintIndex Footprint index.
 * @returns {object}
 */
function footprintOutput(footprint, footprintIndex) {
    const footprintKey =
        'footprint-' + footprintIndex + '-' + slug(footprint?.name)
    return {
        kind: 'footprint',
        footprintKey,
        name: String(footprint?.name || ''),
        libraryName: String(footprint?.libraryName || ''),
        sourceFile: String(
            footprint?.fileName ||
                footprint?.sourceFile ||
                footprint?.path ||
                ''
        ),
        outputSvgKey: 'pcb-library/' + footprintKey + '.svg',
        layerSvgs: footprintLayers(footprint).map((layer) => ({
            layerKey: slug(layer),
            layerId: layer,
            displayName: layer,
            outputSvgKey:
                'pcb-library/' + footprintKey + '/' + slug(layer) + '.svg'
        })),
        assets: (footprint?.models || []).map((model) => ({
            kind: 'model',
            path: String(model?.path || model?.name || '')
        })),
        embeddedAssets: embeddedAssets(footprint)
    }
}

/**
 * Builds render outputs for one schematic symbol.
 * @param {object} symbol Symbol row.
 * @param {number} symbolIndex Symbol index.
 * @returns {object[]}
 */
function symbolOutputs(symbol, symbolIndex) {
    const symbolKey = 'symbol-' + symbolIndex + '-' + slug(symbol?.name)
    const units =
        Array.isArray(symbol?.units) && symbol.units.length
            ? symbol.units
            : [{ name: 'default' }]
    const assets = embeddedAssets(symbol)

    return units.map((unit, unitIndex) => {
        const unitKey = symbolKey + '/unit-' + unitIndex
        return {
            kind: 'symbol',
            symbolKey,
            name: String(symbol?.name || ''),
            unitKey,
            unitName: String(unit?.name || unitIndex),
            outputSvgKey: 'schematic-library/' + unitKey + '.svg',
            embeddedAssets: assets
        }
    })
}

/**
 * Builds one design block output descriptor.
 * @param {object} block Design block row.
 * @param {number} blockIndex Block index.
 * @returns {object}
 */
function designBlockOutput(block, blockIndex) {
    const blockKey = 'design-block-' + blockIndex + '-' + slug(block?.name)
    return {
        kind: 'design-block',
        blockKey,
        name: String(block?.name || ''),
        libraryName: String(block?.libraryName || ''),
        sourceFolder: String(block?.path || ''),
        schematicFile: String(block?.schematicFile || ''),
        boardFile: String(block?.boardFile || ''),
        outputManifestKey: 'design-blocks/' + blockKey + '/manifest.json',
        embeddedAssets: []
    }
}

/**
 * Builds a mixed-index output descriptor.
 * @param {object} wrapper Library index item wrapper.
 * @param {number} index Item index.
 * @returns {object | null}
 */
function indexItemOutput(wrapper, index) {
    const item = wrapper.item || wrapper
    if (wrapper.kind === 'footprint') {
        return footprintOutput(
            {
                ...item,
                name: wrapper.name || item.name,
                libraryName: wrapper.libraryName || item.libraryName,
                fileName: wrapper.fileName || item.fileName
            },
            index
        )
    }
    if (wrapper.kind === 'symbol') {
        return symbolOutputs(
            {
                ...item,
                name: wrapper.name || item.name,
                libraryName: wrapper.libraryName || item.libraryName,
                fileName: wrapper.fileName || item.fileName
            },
            index
        )[0]
    }
    if (wrapper.kind === 'design-block') {
        return designBlockOutput(
            {
                ...item,
                name: wrapper.name || item.name,
                libraryName: wrapper.libraryName || item.libraryName,
                path: wrapper.fileName || item.path
            },
            index
        )
    }
    return null
}

/**
 * Collects unique layer names used by a footprint.
 * @param {object} footprint Footprint row.
 * @returns {string[]}
 */
function footprintLayers(footprint) {
    return dedupe([
        ...(footprint?.pads || []).flatMap((pad) => [
            pad.layer,
            ...(pad.layers || [])
        ]),
        ...(footprint?.drawings || []).map((drawing) => drawing.layer),
        ...(footprint?.texts || []).map((text) => text.layer)
    ]).sort()
}

/**
 * Extracts embedded assets from a row.
 * @param {object} item Source row.
 * @returns {object[]}
 */
function embeddedAssets(item) {
    return [
        ...(item?.embeddedAssets || []),
        ...(item?.images || []).map((image, index) => ({
            key: image.key || image.uuid || 'image-' + index,
            format: image.format || '',
            name: image.name || ''
        }))
    ].map(stripEmpty)
}

/**
 * Deduplicates asset descriptors.
 * @param {object[]} assets Asset descriptors.
 * @returns {object[]}
 */
function dedupeAssets(assets) {
    const byKey = new Map()
    for (const asset of assets || []) {
        const key = JSON.stringify(asset || {})
        if (!byKey.has(key)) byKey.set(key, asset)
    }
    return [...byKey.values()]
}

/**
 * Deduplicates truthy string values.
 * @param {unknown[]} values Candidate values.
 * @returns {string[]}
 */
function dedupe(values) {
    return [
        ...new Set(
            (values || [])
                .map((value) => String(value || '').trim())
                .filter(Boolean)
        )
    ]
}

/**
 * Returns a stable lowercase slug.
 * @param {unknown} value Raw value.
 * @returns {string}
 */
function slug(value) {
    return (
        String(value || 'item')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/gu, '-')
            .replace(/^-|-$/gu, '') || 'item'
    )
}

/**
 * Removes undefined and empty-string fields.
 * @param {object} value Source object.
 * @returns {object}
 */
function stripEmpty(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter((entry) => {
            return entry[1] !== undefined && entry[1] !== ''
        })
    )
}
