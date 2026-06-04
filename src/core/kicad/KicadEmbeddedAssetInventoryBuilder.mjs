// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'

/**
 * Builds a unified inventory of embedded and companion KiCad assets.
 */
export class KicadEmbeddedAssetInventoryBuilder {
    /**
     * Builds an asset inventory from parsed documents and project assets.
     * @param {object | object[]} input Project result, document array, or document.
     * @param {{ assets?: object[], entries?: object[], fileName?: string }} [options] Inventory options.
     * @returns {object}
     */
    static build(input, options = {}) {
        const documents = resolveDocuments(input)
        const externalAssets = resolveExternalAssets(input, options)
        const externalNames = new Set(
            externalAssets.map((asset) => normalizePath(asset.name))
        )
        const assets = [
            ...documents.flatMap((document) =>
                documentAssets(document, externalNames)
            ),
            ...externalAssets.map(externalAssetRow)
        ]
        const summary = summarizeAssets(assets)

        return NormalizedModelSchema.attach({
            sourceFormat: 'kicad',
            kind: 'asset-inventory',
            fileType: 'KicadAssetInventory',
            fileName: String(options.fileName || ''),
            summary,
            diagnostics: [],
            assets,
            assetsByKind: groupByKind(assets),
            bom: []
        })
    }
}

/**
 * Resolves documents from supported input shapes.
 * @param {object | object[]} input Input value.
 * @returns {object[]}
 */
function resolveDocuments(input) {
    if (Array.isArray(input)) return input
    if (Array.isArray(input?.documents)) return input.documents
    if (input?.kind) return [input]
    return []
}

/**
 * Resolves companion asset entries.
 * @param {object | object[]} input Input value.
 * @param {{ assets?: object[], entries?: object[] }} options Options.
 * @returns {object[]}
 */
function resolveExternalAssets(input, options) {
    return [
        ...(Array.isArray(input?.assets) ? input.assets : []),
        ...(Array.isArray(options.assets) ? options.assets : []),
        ...(Array.isArray(options.entries)
            ? options.entries.filter((entry) => isCompanionAsset(entry.name))
            : [])
    ]
}

/**
 * Collects assets from one parsed document.
 * @param {object} document Parsed document.
 * @param {Set<string>} externalNames Available external asset names.
 * @returns {object[]}
 */
function documentAssets(document, externalNames) {
    if (document?.kind === 'schematic') {
        return schematicAssets(document)
    }
    if (document?.kind === 'pcb') {
        return pcbAssets(document, externalNames)
    }
    if (document?.kind === 'worksheet') {
        return worksheetAssets(document)
    }
    return []
}

/**
 * Collects schematic embedded file and image rows.
 * @param {object} document Parsed schematic document.
 * @returns {object[]}
 */
function schematicAssets(document) {
    const schematic = document.schematic || {}
    return [
        ...(schematic.embeddedFiles || []).map((file, index) =>
            assetRow({
                kind: 'embedded-file',
                name: file.name || 'embedded-file-' + index,
                fileName: document.fileName,
                format: extension(file.name),
                dataLength: String(file.data || '').length,
                available: Boolean(file.data)
            })
        ),
        ...(schematic.images || []).map((image, index) =>
            assetRow({
                kind: 'schematic-image',
                name: image.name || 'schematic-image-' + index,
                fileName: document.fileName,
                uuid: image.uuid || '',
                format: image.format || '',
                dataLength: String(image.data || '').length,
                available: Boolean(image.data)
            })
        )
    ]
}

/**
 * Collects PCB model reference rows.
 * @param {object} document Parsed PCB document.
 * @param {Set<string>} externalNames Available external asset names.
 * @returns {object[]}
 */
function pcbAssets(document, externalNames) {
    const rows = []
    const seen = new Set()
    const addModel = (model, owner) => {
        const path = String(model?.path || model?.name || '').trim()
        if (!path) return
        const key = normalizePath(document.fileName) + '\u0000' + path
        if (seen.has(key)) return
        seen.add(key)
        rows.push(
            assetRow({
                kind: 'model-ref',
                name: path,
                fileName: document.fileName,
                owner,
                format: extension(path),
                available: externalNames.has(normalizePath(path))
            })
        )
    }

    for (const component of document?.pcb?.components || []) {
        for (const model of component.models || []) {
            addModel(model, component.designator || component.reference || '')
        }
    }
    for (const footprint of document?.pcb?.kicadBoard?.footprints || []) {
        for (const model of footprint.models || []) {
            addModel(model, footprint.reference || footprint.designator || '')
        }
    }

    return rows
}

/**
 * Collects worksheet bitmap rows.
 * @param {object} document Parsed worksheet document.
 * @returns {object[]}
 */
function worksheetAssets(document) {
    return (document.bitmaps || []).map((bitmap, index) =>
        assetRow({
            kind: 'worksheet-bitmap',
            name: bitmap.name || 'worksheet-bitmap-' + index,
            fileName: document.fileName,
            format: bitmap.format || '',
            dataLength: String(bitmap.data || '').length,
            available: Boolean(bitmap.data || bitmap.path)
        })
    )
}

/**
 * Builds one external asset row.
 * @param {object} entry Asset entry.
 * @param {number} index Asset index.
 * @returns {object}
 */
function externalAssetRow(entry, index) {
    return assetRow({
        kind: 'external-asset',
        name: entry.name || 'external-asset-' + index,
        fileName: entry.name || '',
        format: extension(entry.name),
        byteLength: entry.bytes?.byteLength || 0,
        available: true
    })
}

/**
 * Builds a normalized asset row.
 * @param {object} row Row fields.
 * @returns {object}
 */
function assetRow(row) {
    return stripUndefined({
        kind: String(row.kind || ''),
        name: String(row.name || ''),
        fileName: String(row.fileName || ''),
        owner: row.owner ? String(row.owner) : undefined,
        uuid: row.uuid ? String(row.uuid) : undefined,
        format: String(row.format || ''),
        byteLength: row.byteLength,
        dataLength: row.dataLength,
        available: row.available === true
    })
}

/**
 * Builds inventory counters.
 * @param {object[]} assets Asset rows.
 * @returns {object}
 */
function summarizeAssets(assets) {
    return {
        title: 'KiCad asset inventory',
        assetCount: assets.length,
        embeddedFileCount: countKind(assets, 'embedded-file'),
        imageCount:
            countKind(assets, 'schematic-image') +
            countKind(assets, 'pcb-image'),
        modelCount: countKind(assets, 'model-ref'),
        worksheetBitmapCount: countKind(assets, 'worksheet-bitmap'),
        externalAssetCount: countKind(assets, 'external-asset')
    }
}

/**
 * Counts rows of one kind.
 * @param {object[]} assets Asset rows.
 * @param {string} kind Kind.
 * @returns {number}
 */
function countKind(assets, kind) {
    return assets.filter((asset) => asset.kind === kind).length
}

/**
 * Groups assets by kind.
 * @param {object[]} assets Asset rows.
 * @returns {Record<string, object[]>}
 */
function groupByKind(assets) {
    const groups = {}
    for (const asset of assets || []) {
        groups[asset.kind] ||= []
        groups[asset.kind].push(asset)
    }
    return groups
}

/**
 * Returns true for common KiCad companion asset file names.
 * @param {string} fileName File name.
 * @returns {boolean}
 */
function isCompanionAsset(fileName) {
    return /\.(step|stp|wrl|vrml|png|jpg|jpeg|svg|ttf|otf|woff2?)$/i.test(
        String(fileName || '')
    )
}

/**
 * Returns a lowercase extension without dot.
 * @param {string} fileName File name.
 * @returns {string}
 */
function extension(fileName) {
    const match = String(fileName || '').match(/\.([^.\\/]+)$/u)
    return match ? match[1].toLowerCase() : ''
}

/**
 * Normalizes path separators.
 * @param {string} path Path value.
 * @returns {string}
 */
function normalizePath(path) {
    return String(path || '').replace(/\\/g, '/')
}

/**
 * Removes undefined fields from a row.
 * @param {object} row Row.
 * @returns {object}
 */
function stripUndefined(row) {
    return Object.fromEntries(
        Object.entries(row || {}).filter((entry) => entry[1] !== undefined)
    )
}
