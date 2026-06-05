// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonModelAdapter } from '../circuit-json/CircuitJsonModelAdapter.mjs'

const schemaId = 'kicad-toolkit.project.document-graph.a1'

/**
 * Builds a read-only document graph for parsed KiCad project data.
 */
export class KicadProjectDocumentGraphBuilder {
    /**
     * Builds a normalized project document graph index.
     * @param {object} projectModel Parsed project loader result or project payload.
     * @param {{ documentModels?: object[], availablePaths?: string[] | Set<string>, generatedOutputs?: object[], jobsets?: object[], libraries?: object, assets?: object[] }} [options] Graph options.
     * @returns {object}
     */
    static build(projectModel = {}, options = {}) {
        const project = projectModel?.project || projectModel || {}
        const documents = documentRows(project, projectModel, options)
        const libraries = libraryRows(projectModel, options)
        const designBlocks = designBlockRows(projectModel, options)
        const jobsets = jobsetRows(projectModel, options)
        const assets = assetRows(projectModel, options)
        const generatedOutputs = outputRows(options.generatedOutputs || [])
        const missingPaths = [
            ...documents,
            ...libraries,
            ...designBlocks,
            ...jobsets
        ]
            .filter((row) => row.exists === false)
            .map((row) => row.normalizedPath)

        return {
            schema: schemaId,
            summary: {
                documentCount: documents.length,
                sourceSheetCount: documents.filter(
                    (row) => row.kind === 'schematic'
                ).length,
                pcbDocumentCount: documents.filter((row) => row.kind === 'pcb')
                    .length,
                linkedLibraryCount: libraries.length,
                jobsetCount: jobsets.length,
                designBlockCount: designBlocks.length,
                generatedOutputCount: generatedOutputs.length,
                assetCount: assets.length,
                missingPathCount: missingPaths.length
            },
            documents,
            libraries,
            designBlocks,
            jobsets,
            assets,
            generatedOutputs,
            groups: groups({
                documents,
                libraries,
                designBlocks,
                jobsets,
                assets,
                generatedOutputs,
                missingPaths
            }),
            indexes: indexes({
                documents,
                libraries,
                designBlocks,
                jobsets,
                assets,
                generatedOutputs
            })
        }
    }
}

/**
 * Builds document rows from project pages and parsed document models.
 * @param {object} project Project summary.
 * @param {object} projectModel Loader result.
 * @param {object} options Graph options.
 * @returns {object[]}
 */
function documentRows(project, projectModel, options) {
    const availablePaths = availablePathSet(options.availablePaths)
    const documentModels = resolveDocumentModels(projectModel, options)
    const byFileName = new Map(
        documentModels.map((model) => [normalizePath(model.fileName), model])
    )
    const rows = []
    const seen = new Set()

    for (const page of project.pages || []) {
        const normalizedPath = normalizePath(page.fileName || page.path)
        seen.add(normalizedPath)
        rows.push(
            stripUndefined({
                graphIndex: rows.length,
                path: page.path || '',
                normalizedPath,
                fileName: baseName(normalizedPath),
                extension: extension(normalizedPath),
                kind: page.kind || documentKind(byFileName.get(normalizedPath)),
                title:
                    page.title ||
                    byFileName.get(normalizedPath)?.summary?.title,
                page: page.page || '',
                root: page.root === true,
                exists: existsInSet(availablePaths, normalizedPath)
            })
        )
    }

    for (const model of documentModels) {
        const normalizedPath = normalizePath(model.fileName)
        if (!normalizedPath || seen.has(normalizedPath)) continue
        rows.push(
            stripUndefined({
                graphIndex: rows.length,
                path: '',
                normalizedPath,
                fileName: baseName(normalizedPath),
                extension: extension(normalizedPath),
                kind: documentKind(model),
                title: model.summary?.title || baseName(normalizedPath),
                page: '',
                root: false,
                exists: existsInSet(availablePaths, normalizedPath)
            })
        )
    }

    return rows
}

/**
 * Resolves renderer-compatible document models.
 * @param {object} projectModel Loader result.
 * @param {object} options Graph options.
 * @returns {object[]}
 */
function resolveDocumentModels(projectModel, options) {
    const records =
        options.documentModels ||
        projectModel.rendererDocuments ||
        projectModel.documents ||
        []
    return (Array.isArray(records) ? records : []).map((record) => {
        if (record?.kind || record?.schematic || record?.pcb) return record
        return CircuitJsonModelAdapter.toRendererModel(record)
    })
}

/**
 * Builds library graph rows.
 * @param {object} projectModel Loader result.
 * @param {object} options Graph options.
 * @returns {object[]}
 */
function libraryRows(projectModel, options) {
    const availablePaths = availablePathSet(options.availablePaths)
    const libraries = (options.libraries || projectModel.libraries || {})
        .libraries
    return (Array.isArray(libraries) ? libraries : []).map(
        (library, libraryIndex) => {
            const normalizedPath = normalizePath(library.path || library.uri)
            return stripUndefined({
                libraryIndex,
                name: String(library.name || ''),
                kind: String(library.kind || ''),
                normalizedPath,
                path: library.path || library.uri || '',
                exists: existsInSet(availablePaths, normalizedPath)
            })
        }
    )
}

/**
 * Builds design block graph rows from library index items.
 * @param {object} projectModel Loader result.
 * @param {object} options Graph options.
 * @returns {object[]}
 */
function designBlockRows(projectModel, options) {
    const availablePaths = availablePathSet(options.availablePaths)
    const items = (options.libraries || projectModel.libraries || {}).items
    return (Array.isArray(items) ? items : [])
        .filter((item) => item.kind === 'design-block')
        .map((item, designBlockIndex) => {
            const normalizedPath = normalizePath(item.fileName || item.path)
            return stripUndefined({
                designBlockIndex,
                name: String(item.name || ''),
                libraryName: String(item.libraryName || ''),
                normalizedPath,
                path: item.fileName || item.path || '',
                exists: existsInSet(availablePaths, normalizedPath)
            })
        })
}

/**
 * Builds jobset graph rows.
 * @param {object} projectModel Loader result.
 * @param {object} options Graph options.
 * @returns {object[]}
 */
function jobsetRows(projectModel, options) {
    const availablePaths = availablePathSet(options.availablePaths)
    return resolveJobsets(projectModel, options).map((jobset, jobsetIndex) => {
        const normalizedPath = normalizePath(jobset.fileName)
        return stripUndefined({
            jobsetIndex,
            normalizedPath,
            fileName: baseName(normalizedPath),
            jobCount: (jobset.jobs || []).length,
            outputCount: (jobset.outputs || []).length,
            exists: existsInSet(availablePaths, normalizedPath)
        })
    })
}

/**
 * Resolves parsed jobset records.
 * @param {object} projectModel Loader result.
 * @param {object} options Graph options.
 * @returns {object[]}
 */
function resolveJobsets(projectModel, options) {
    return [
        ...(Array.isArray(options.jobsets) ? options.jobsets : []),
        ...(Array.isArray(projectModel.jobsets) ? projectModel.jobsets : []),
        ...(Array.isArray(projectModel.documents)
            ? projectModel.documents.filter((entry) => entry?.kind === 'jobset')
            : [])
    ]
}

/**
 * Builds asset graph rows.
 * @param {object} projectModel Loader result.
 * @param {object} options Graph options.
 * @returns {object[]}
 */
function assetRows(projectModel, options) {
    return [
        ...(Array.isArray(projectModel.assets) ? projectModel.assets : []),
        ...(Array.isArray(options.assets) ? options.assets : [])
    ].map((asset, assetIndex) => {
        const normalizedPath = normalizePath(asset.name || asset.fileName)
        return stripUndefined({
            assetIndex,
            normalizedPath,
            fileName: baseName(normalizedPath),
            extension: extension(normalizedPath),
            byteLength: asset.bytes?.byteLength || asset.byteLength
        })
    })
}

/**
 * Builds generated output rows.
 * @param {object[]} outputs Generated outputs.
 * @returns {object[]}
 */
function outputRows(outputs) {
    return (Array.isArray(outputs) ? outputs : []).map((output, outputIndex) =>
        stripUndefined({
            outputIndex,
            sourceFileName: String(output.sourceFileName || ''),
            type: String(output.type || ''),
            name: String(output.name || ''),
            path: output.path || output.targetPath || '',
            normalizedPath: normalizePath(output.path || output.targetPath)
        })
    )
}

/**
 * Builds graph groups.
 * @param {object} rows Graph rows.
 * @returns {object}
 */
function groups(rows) {
    return {
        sourceSheets: rows.documents
            .filter((row) => row.kind === 'schematic')
            .map((row) => row.normalizedPath),
        pcbs: rows.documents
            .filter((row) => row.kind === 'pcb')
            .map((row) => row.normalizedPath),
        linkedLibraries: rows.libraries.map((row) => row.normalizedPath),
        designBlocks: rows.designBlocks.map((row) => row.normalizedPath),
        jobsets: rows.jobsets.map((row) => row.normalizedPath),
        assets: rows.assets.map((row) => row.normalizedPath),
        generatedOutputs: rows.generatedOutputs.map(
            (row) => row.normalizedPath
        ),
        missingPaths: rows.missingPaths
    }
}

/**
 * Builds graph indexes.
 * @param {object} rows Graph rows.
 * @returns {object}
 */
function indexes(rows) {
    const sources = [
        ...rows.documents,
        ...rows.libraries,
        ...rows.designBlocks,
        ...rows.jobsets,
        ...rows.assets,
        ...rows.generatedOutputs
    ]
    const byPath = {}
    const byKind = {}

    for (const row of sources) {
        if (!row.normalizedPath) continue
        byPath[row.normalizedPath] = row
        const kind = row.kind || row.type || graphKind(row)
        byKind[kind] ||= []
        byKind[kind].push(row.normalizedPath)
    }

    return { byPath, byKind }
}

/**
 * Resolves a generic graph kind for non-document rows.
 * @param {object} row Graph row.
 * @returns {string}
 */
function graphKind(row) {
    if ('libraryIndex' in row) return 'library'
    if ('designBlockIndex' in row) return 'design-block'
    if ('jobsetIndex' in row) return 'jobset'
    if ('assetIndex' in row) return 'asset'
    if ('outputIndex' in row) return 'generated-output'
    return 'unknown'
}

/**
 * Resolves a document kind.
 * @param {object} model Parsed document model.
 * @returns {string}
 */
function documentKind(model) {
    if (model?.kind) return String(model.kind)
    if (model?.schematic) return 'schematic'
    if (model?.pcb) return 'pcb'
    return 'other'
}

/**
 * Builds an available path lookup.
 * @param {string[] | Set<string> | undefined} paths Paths.
 * @returns {Set<string> | null}
 */
function availablePathSet(paths) {
    if (paths == null) return null
    return new Set([...paths].map(normalizePath))
}

/**
 * Checks whether a path exists in an optional lookup.
 * @param {Set<string> | null} paths Available paths.
 * @param {string} path Path.
 * @returns {boolean | undefined}
 */
function existsInSet(paths, path) {
    if (paths === null || !path) return undefined
    return paths.has(normalizePath(path))
}

/**
 * Normalizes a project-relative path.
 * @param {unknown} path Path.
 * @returns {string}
 */
function normalizePath(path) {
    return String(path || '')
        .replace(/\\/gu, '/')
        .replace(/^\.\//u, '')
}

/**
 * Returns a path basename.
 * @param {string} path Path.
 * @returns {string}
 */
function baseName(path) {
    return (
        String(path || '')
            .split('/')
            .filter(Boolean)
            .pop() || ''
    )
}

/**
 * Returns a lowercase extension without the dot.
 * @param {string} path Path.
 * @returns {string}
 */
function extension(path) {
    const match = baseName(path).match(/\.([^.]+)$/u)
    return match ? match[1].toLowerCase() : ''
}

/**
 * Removes undefined fields.
 * @param {object} row Row.
 * @returns {object}
 */
function stripUndefined(row) {
    return Object.fromEntries(
        Object.entries(row).filter(([, value]) => value !== undefined)
    )
}
