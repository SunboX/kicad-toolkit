// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schemaId = 'kicad-toolkit.schematic.hierarchy-graph.a1'

/**
 * Builds a read-only schematic hierarchy graph from KiCad project pages.
 */
export class KicadSchematicHierarchyGraphBuilder {
    /**
     * Builds a schematic hierarchy graph.
     * @param {object} projectModel Parsed project loader result or project payload.
     * @param {{ documentModels?: object[] }} [options] Graph options.
     * @returns {object}
     */
    static build(projectModel = {}, options = {}) {
        const project = projectModel.project || projectModel || {}
        const documentModels = normalizedDocumentModels(
            options.documentModels || projectModel.rendererDocuments || []
        )
        const nodes = schematicNodes(project, documentModels)
        const nodeByFileName = new Map(
            nodes.map((node) => [node.fileName, node])
        )
        const edges = hierarchyEdges(documentModels, nodeByFileName)
        const roots = rootFileNames(project, nodes)

        return {
            schema: schemaId,
            summary: {
                sheetCount: nodes.length,
                edgeCount: edges.length,
                rootCount: roots.length,
                missingSheetCount: edges.filter((edge) => !edge.resolved).length
            },
            roots,
            nodes,
            edges,
            indexes: {
                byFileName: Object.fromEntries(
                    nodes.map((node) => [node.fileName, node])
                ),
                childrenByFileName: childrenByFileName(edges)
            }
        }
    }
}

/**
 * Normalizes document model records.
 * @param {object[]} documentModels Document models.
 * @returns {object[]}
 */
function normalizedDocumentModels(documentModels) {
    return (Array.isArray(documentModels) ? documentModels : []).filter(
        (model) => model?.schematic || model?.kind === 'schematic'
    )
}

/**
 * Builds graph nodes from project pages and parsed schematic documents.
 * @param {object} project Project summary.
 * @param {object[]} documentModels Document models.
 * @returns {object[]}
 */
function schematicNodes(project, documentModels) {
    const rows = []
    const seen = new Set()
    const documentsByFileName = new Map(
        documentModels.map((model) => [normalizePath(model.fileName), model])
    )

    for (const page of project.pages || []) {
        if (page?.kind && page.kind !== 'schematic') continue
        const fileName = normalizePath(page.fileName || page.path)
        if (!fileName || seen.has(fileName)) continue
        seen.add(fileName)
        rows.push(
            stripUndefined({
                fileName,
                title:
                    page.title ||
                    documentsByFileName.get(fileName)?.summary?.title ||
                    documentsByFileName.get(fileName)?.schematic?.sheet?.title,
                path: page.path || '',
                page: page.page || '',
                root: page.root === true
            })
        )
    }

    for (const model of documentModels) {
        const fileName = normalizePath(model.fileName)
        if (!fileName || seen.has(fileName)) continue
        seen.add(fileName)
        rows.push(
            stripUndefined({
                fileName,
                title:
                    model.summary?.title ||
                    model.schematic?.sheet?.title ||
                    basename(fileName),
                path: '',
                page: '',
                root: false
            })
        )
    }

    return rows
}

/**
 * Builds hierarchy edges from sheet symbols.
 * @param {object[]} documentModels Document models.
 * @param {Map<string, object>} nodeByFileName Node lookup.
 * @returns {object[]}
 */
function hierarchyEdges(documentModels, nodeByFileName) {
    return documentModels.flatMap((model) => {
        const from = normalizePath(model.fileName)
        return (model.schematic?.sheetSymbols || []).map((sheet) => {
            const to = resolveSheetFileName(from, sheet.fileName || sheet.path)
            return {
                from,
                to,
                sheetName: String(
                    sheet.name || sheet.sheetName || sheet.title || ''
                ),
                sheetPath: String(sheet.path || ''),
                sheetUuid: String(sheet.uuid || sheet.id || ''),
                resolved: nodeByFileName.has(to)
            }
        })
    })
}

/**
 * Builds root file names from project metadata.
 * @param {object} project Project summary.
 * @param {object[]} nodes Graph nodes.
 * @returns {string[]}
 */
function rootFileNames(project, nodes) {
    const explicitRoot = normalizePath(project.rootSchematic)
    if (explicitRoot) return [explicitRoot]
    const roots = nodes.filter((node) => node.root).map((node) => node.fileName)
    return roots.length ? roots : nodes.slice(0, 1).map((node) => node.fileName)
}

/**
 * Builds child indexes keyed by source file name.
 * @param {object[]} edges Edge rows.
 * @returns {Record<string, string[]>}
 */
function childrenByFileName(edges) {
    const groups = {}

    for (const edge of edges) {
        if (!groups[edge.from]) groups[edge.from] = []
        groups[edge.from].push(edge.to)
    }

    return groups
}

/**
 * Resolves one sheet file reference relative to a source schematic.
 * @param {string} sourceFileName Source schematic file name.
 * @param {string} target Target sheet path.
 * @returns {string}
 */
function resolveSheetFileName(sourceFileName, target) {
    const normalizedTarget = normalizePath(target)
    if (!normalizedTarget) return ''
    if (normalizedTarget.includes('/')) return normalizedTarget
    const directory = normalizePath(sourceFileName).split('/').slice(0, -1)
    return normalizePath([...directory, normalizedTarget].join('/'))
}

/**
 * Normalizes path separators and duplicate slashes.
 * @param {unknown} value Path value.
 * @returns {string}
 */
function normalizePath(value) {
    return String(value || '')
        .replace(/\\/gu, '/')
        .replace(/\/+/gu, '/')
        .replace(/^\.\//u, '')
}

/**
 * Returns a path basename.
 * @param {string} path Path value.
 * @returns {string}
 */
function basename(path) {
    return String(path || '')
        .split('/')
        .at(-1)
}

/**
 * Removes undefined fields.
 * @param {Record<string, unknown>} value Source object.
 * @returns {Record<string, unknown>}
 */
function stripUndefined(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(([, entryValue]) => {
            return entryValue !== undefined
        })
    )
}
