// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { strFromU8, unzipSync } from 'fflate'
import { CircuitJsonModelAdapter } from '../circuit-json/CircuitJsonModelAdapter.mjs'
import { KicadParser } from './KicadParser.mjs'
import { KicadPcbParser } from './KicadPcbParser.mjs'

/**
 * Loads KiCad board files from direct files or project ZIP archives.
 */
export class KicadProjectLoader {
    /**
     * Loads browser File objects.
     * @param {FileList | File[]} files
     * @returns {Promise<{ board: object, sourceFileName: string, sourceText: string }>}
     */
    static async loadFiles(files) {
        const entries = await Promise.all(
            Array.from(files || []).map(async (file) => {
                return {
                    name: file.name,
                    bytes: new Uint8Array(await file.arrayBuffer())
                }
            })
        )
        return KicadProjectLoader.loadEntries(entries)
    }

    /**
     * Loads named byte entries.
     * @param {{ name: string, bytes: Uint8Array }[]} entries
     * @returns {Promise<object>}
     */
    static async loadEntries(entries) {
        const expandedEntries = KicadProjectLoader.expandArchiveEntries(entries)
        const projectEntry = expandedEntries.find((entry) =>
            KicadProjectLoader.isProjectFile(entry.name)
        )
        const schematicEntries = expandedEntries.filter((entry) =>
            KicadProjectLoader.isSchematicFile(entry.name)
        )
        const boardEntries = expandedEntries.filter((entry) =>
            KicadProjectLoader.isBoardFile(entry.name)
        )
        const isFullProject =
            Boolean(projectEntry) ||
            schematicEntries.length > 0 ||
            boardEntries.length > 1

        if (isFullProject) {
            return KicadProjectLoader.#loadProjectEntries(
                expandedEntries,
                projectEntry,
                schematicEntries,
                boardEntries
            )
        }

        const boardEntry = KicadProjectLoader.findBoardEntry(expandedEntries)
        if (!boardEntry) {
            throw new Error(
                'No .kicad_pcb file found. Open a KiCad board or project ZIP.'
            )
        }

        const source = strFromU8(boardEntry.bytes)
        const board = KicadPcbParser.parse(source, {
            fileName: boardEntry.name
        })
        const rendererDocument = KicadParser.wrapBoard(board, boardEntry.name)
        const document =
            CircuitJsonModelAdapter.fromRendererModel(rendererDocument)
        return {
            board,
            documents: [document],
            rendererDocuments: [rendererDocument],
            project: KicadProjectLoader.#buildProjectSummary(
                '',
                [document],
                []
            ),
            assets: [],
            diagnostics: [],
            sourceFileName: boardEntry.name,
            sourceText: source
        }
    }

    /**
     * Finds a direct or archived board entry.
     * @param {{ name: string, bytes: Uint8Array }[]} entries
     * @returns {{ name: string, bytes: Uint8Array } | null}
     */
    static findBoardEntry(entries) {
        const expandedEntries = KicadProjectLoader.expandArchiveEntries(entries)
        const direct = expandedEntries.find((entry) => {
            return KicadProjectLoader.isBoardFile(entry.name)
        })
        if (direct) return direct

        for (const entry of expandedEntries) {
            if (!KicadProjectLoader.isZipFile(entry.name)) continue

            const archiveEntries = unzipSync(entry.bytes)
            const boardName = Object.keys(archiveEntries)
                .filter((name) => !name.startsWith('__MACOSX/'))
                .find((name) => KicadProjectLoader.isBoardFile(name))

            if (boardName) {
                return {
                    name: boardName,
                    bytes: archiveEntries[boardName]
                }
            }
        }

        return null
    }

    /**
     * Returns true for KiCad board filenames.
     * @param {string} fileName
     * @returns {boolean}
     */
    static isBoardFile(fileName) {
        return /\.kicad_pcb$/i.test(String(fileName || ''))
    }

    /**
     * Returns true for KiCad schematic filenames.
     * @param {string} fileName File name.
     * @returns {boolean}
     */
    static isSchematicFile(fileName) {
        return /\.kicad_sch$/i.test(String(fileName || ''))
    }

    /**
     * Returns true for KiCad project filenames.
     * @param {string} fileName File name.
     * @returns {boolean}
     */
    static isProjectFile(fileName) {
        return /\.kicad_pro$/i.test(String(fileName || ''))
    }

    /**
     * Returns true for ZIP filenames.
     * @param {string} fileName
     * @returns {boolean}
     */
    static isZipFile(fileName) {
        return /\.zip$/i.test(String(fileName || ''))
    }

    /**
     * Expands ZIP entries into a flat named byte list.
     * @param {{ name: string, bytes: Uint8Array }[]} entries Entries.
     * @returns {{ name: string, bytes: Uint8Array }[]}
     */
    static expandArchiveEntries(entries) {
        const expanded = []
        for (const entry of entries || []) {
            if (!KicadProjectLoader.isZipFile(entry.name)) {
                expanded.push(entry)
                continue
            }

            const archiveEntries = unzipSync(entry.bytes)
            for (const [name, bytes] of Object.entries(archiveEntries)) {
                if (name.startsWith('__MACOSX/')) continue
                expanded.push({ name, bytes })
            }
        }
        return expanded
    }

    /**
     * Loads full project entries.
     * @param {{ name: string, bytes: Uint8Array }[]} entries Entries.
     * @param {{ name: string, bytes: Uint8Array } | undefined} projectEntry Project entry.
     * @param {{ name: string, bytes: Uint8Array }[]} schematicEntries Schematics.
     * @param {{ name: string, bytes: Uint8Array }[]} boardEntries Boards.
     * @returns {object}
     */
    static #loadProjectEntries(
        entries,
        projectEntry,
        schematicEntries,
        boardEntries
    ) {
        const diagnostics = []
        const documents = [
            ...schematicEntries.map((entry) =>
                KicadParser.parseArrayBuffer(entry.name, entry.bytes)
            ),
            ...boardEntries.map((entry) =>
                KicadParser.parseArrayBuffer(entry.name, entry.bytes)
            )
        ]
        const rootName = KicadProjectLoader.#resolveRootSchematicName(
            projectEntry,
            schematicEntries
        )
        const schematicDocuments = documents.filter(
            (document) => document.kind === 'schematic'
        )
        const knownSchematicNames = new Set(
            schematicEntries.map((entry) => baseName(entry.name).toLowerCase())
        )

        for (const document of schematicDocuments) {
            for (const sheet of document.schematic.sheetSymbols || []) {
                if (
                    sheet.fileName &&
                    !knownSchematicNames.has(
                        baseName(sheet.fileName).toLowerCase()
                    )
                ) {
                    diagnostics.push({
                        severity: 'warning',
                        message:
                            'Missing schematic sheet ' + sheet.fileName + '.'
                    })
                }
            }
        }

        const hierarchy = KicadProjectLoader.#buildProjectHierarchy(
            rootName,
            documents
        )
        const project = KicadProjectLoader.#buildProjectSummary(
            projectEntry?.name || rootName,
            documents,
            KicadProjectLoader.#buildProjectNets(schematicDocuments),
            hierarchy
        )

        return {
            project,
            documents,
            rendererDocuments: documents.map((document) =>
                CircuitJsonModelAdapter.toRendererModel(document)
            ),
            assets: entries.filter((entry) =>
                /\.(step|stp|wrl|vrml)$/i.test(entry.name)
            ),
            diagnostics
        }
    }

    /**
     * Resolves the root schematic name for a project.
     * @param {{ name: string } | undefined} projectEntry Project entry.
     * @param {{ name: string }[]} schematicEntries Schematic entries.
     * @returns {string}
     */
    static #resolveRootSchematicName(projectEntry, schematicEntries) {
        if (!schematicEntries.length) return ''
        if (!projectEntry) return schematicEntries[0].name

        const projectBase = stripKnownExtension(baseName(projectEntry.name))
        const matched = schematicEntries.find((entry) => {
            return stripKnownExtension(baseName(entry.name)) === projectBase
        })
        return matched?.name || schematicEntries[0].name
    }

    /**
     * Builds project-level metadata.
     * @param {string} sourceName Source name.
     * @param {object[]} documents Documents.
     * @param {object[]} nets Project nets.
     * @param {{ rootSchematic: string, pages: object[] } | null} [hierarchy] Hierarchy.
     * @returns {object}
     */
    static #buildProjectSummary(sourceName, documents, nets, hierarchy = null) {
        const schematicDocuments = documents.filter(
            (document) => document.kind === 'schematic'
        )
        const resolvedHierarchy =
            hierarchy ||
            KicadProjectLoader.#buildProjectHierarchy(sourceName, documents)
        const bom = KicadProjectLoader.#groupProjectBomRows(
            schematicDocuments.flatMap((document) => document.bom || [])
        )
        return {
            name: stripKnownExtension(baseName(sourceName)) || 'kicad-project',
            fileName: sourceName,
            documentCount: documents.length,
            schematicCount: schematicDocuments.length,
            pcbCount: documents.filter((document) => document.kind === 'pcb')
                .length,
            rootSchematic: resolvedHierarchy.rootSchematic,
            pages: resolvedHierarchy.pages,
            nets,
            bom
        }
    }

    /**
     * Builds schematic and PCB page records for a project summary.
     * @param {string} rootName Preferred root schematic file.
     * @param {object[]} documents Parsed documents.
     * @returns {{ rootSchematic: string, pages: object[] }}
     */
    static #buildProjectHierarchy(rootName, documents) {
        const schematicDocuments = documents.filter((document) => {
            return document.kind === 'schematic'
        })
        const indexes = KicadProjectLoader.#schematicIndexes(schematicDocuments)
        const rootDocument =
            KicadProjectLoader.#resolveIndexedSchematic(rootName, indexes) ||
            schematicDocuments[0] ||
            null
        const pages = []
        const visitedDocuments = new Set()

        if (rootDocument) {
            KicadProjectLoader.#appendSchematicPages(
                rootDocument,
                indexes,
                pages,
                visitedDocuments,
                {
                    path: '/',
                    page: '1',
                    root: true,
                    active: new Set()
                }
            )
        }

        for (const document of schematicDocuments) {
            if (visitedDocuments.has(document.fileName)) continue
            KicadProjectLoader.#appendSchematicPages(
                document,
                indexes,
                pages,
                visitedDocuments,
                {
                    path:
                        '/' + stripKnownExtension(baseName(document.fileName)),
                    page: String(schematicPageCount(pages) + 1),
                    root: false,
                    active: new Set()
                }
            )
        }

        for (const document of documents.filter(
            (entry) => entry.kind === 'pcb'
        )) {
            pages.push({
                kind: 'pcb',
                fileName: document.fileName || '',
                title: pageTitle(document),
                path: '',
                page: '',
                root: false
            })
        }

        return {
            rootSchematic: rootDocument?.fileName || '',
            pages
        }
    }

    /**
     * Appends schematic page records recursively.
     * @param {object} document Schematic document.
     * @param {object} indexes Schematic indexes.
     * @param {object[]} pages Accumulated pages.
     * @param {Set<string>} visitedDocuments Visited file names.
     * @param {{ path: string, page: string, root: boolean, active: Set<string> }} context Page context.
     * @returns {void}
     */
    static #appendSchematicPages(
        document,
        indexes,
        pages,
        visitedDocuments,
        context
    ) {
        const fileName = document.fileName || ''
        if (context.active.has(fileName)) return

        visitedDocuments.add(fileName)
        pages.push({
            kind: 'schematic',
            fileName,
            title: pageTitle(document),
            path: context.path,
            page: context.page,
            root: context.root
        })

        const active = new Set(context.active)
        active.add(fileName)
        for (const [index, sheet] of (
            document.schematic?.sheetSymbols || []
        ).entries()) {
            const target = KicadProjectLoader.#resolveSheetSchematic(
                document,
                sheet,
                indexes
            )
            if (!target) continue
            KicadProjectLoader.#appendSchematicPages(
                target,
                indexes,
                pages,
                visitedDocuments,
                {
                    path: childSheetPath(context.path, sheet, index),
                    page: `${context.page}.${index + 1}`,
                    root: false,
                    active
                }
            )
        }
    }

    /**
     * Builds path indexes for schematic documents.
     * @param {object[]} documents Schematic documents.
     * @returns {{ byPath: Map<string, object>, byBase: Map<string, object> }}
     */
    static #schematicIndexes(documents) {
        const byPath = new Map()
        const byBase = new Map()
        for (const document of documents) {
            byPath.set(normalizeEntryPath(document.fileName), document)
            byBase.set(baseName(document.fileName).toLowerCase(), document)
        }
        return { byPath, byBase }
    }

    /**
     * Resolves a schematic document by file name.
     * @param {string} fileName File name.
     * @param {{ byPath: Map<string, object>, byBase: Map<string, object> }} indexes Indexes.
     * @returns {object | undefined}
     */
    static #resolveIndexedSchematic(fileName, indexes) {
        if (!fileName) return undefined
        return (
            indexes.byPath.get(normalizeEntryPath(fileName)) ||
            indexes.byBase.get(baseName(fileName).toLowerCase())
        )
    }

    /**
     * Resolves a sheet file reference from its parent schematic.
     * @param {object} parent Parent schematic document.
     * @param {object} sheet Sheet symbol.
     * @param {{ byPath: Map<string, object>, byBase: Map<string, object> }} indexes Indexes.
     * @returns {object | undefined}
     */
    static #resolveSheetSchematic(parent, sheet, indexes) {
        const fileName = String(sheet.fileName || '')
        if (!fileName) return undefined
        return (
            indexes.byPath.get(
                normalizeEntryPath(
                    joinEntryPath(dirName(parent.fileName), fileName)
                )
            ) ||
            indexes.byPath.get(normalizeEntryPath(fileName)) ||
            indexes.byBase.get(baseName(fileName).toLowerCase())
        )
    }

    /**
     * Builds full project net groups from schematic documents.
     * @param {object[]} schematicDocuments Schematic documents.
     * @returns {object[]}
     */
    static #buildProjectNets(schematicDocuments) {
        const groups = new Map()
        for (const document of schematicDocuments) {
            for (const net of document.schematic.nets || []) {
                KicadProjectLoader.#addProjectNetReference(groups, net.name, {
                    fileName: baseName(document.fileName),
                    kind: 'net'
                })
            }
            for (const label of document.schematic.texts || []) {
                if (
                    label.labelKind === 'global' ||
                    label.labelKind === 'hierarchical'
                ) {
                    KicadProjectLoader.#addProjectNetReference(
                        groups,
                        label.text,
                        {
                            fileName: baseName(document.fileName),
                            kind: label.labelKind
                        }
                    )
                }
            }
            for (const entry of document.schematic.sheetEntries || []) {
                KicadProjectLoader.#addProjectNetReference(groups, entry.name, {
                    fileName: baseName(document.fileName),
                    kind: 'sheet-pin',
                    sheetFile: entry.sheetFile
                })
            }
        }

        return [...groups.values()].map((group) => ({
            name: group.name,
            sheetNames: [...group.sheetNames].sort(),
            references: group.references
        }))
    }

    /**
     * Adds a named project net reference.
     * @param {Map<string, object>} groups Groups.
     * @param {string} name Net name.
     * @param {object} reference Reference.
     * @returns {void}
     */
    static #addProjectNetReference(groups, name, reference) {
        const normalizedName = String(name || '').trim()
        if (!normalizedName) return
        if (!groups.has(normalizedName)) {
            groups.set(normalizedName, {
                name: normalizedName,
                sheetNames: new Set(),
                references: []
            })
        }
        const group = groups.get(normalizedName)
        group.sheetNames.add(reference.fileName)
        if (reference.sheetFile) {
            group.sheetNames.add(baseName(reference.sheetFile))
        }
        group.references.push(reference)
    }

    /**
     * Groups project BOM rows.
     * @param {object[]} rows Document rows.
     * @returns {object[]}
     */
    static #groupProjectBomRows(rows) {
        const grouped = new Map()
        for (const row of rows) {
            const key = [row.value, row.pattern, row.source].join('\u0000')
            if (!grouped.has(key)) {
                grouped.set(key, {
                    designators: [],
                    quantity: 0,
                    value: row.value,
                    pattern: row.pattern,
                    source: row.source
                })
            }
            const target = grouped.get(key)
            target.designators.push(...row.designators)
            target.quantity = target.designators.length
        }
        return [...grouped.values()]
    }
}

/**
 * Returns a display title for one project page.
 * @param {object} document Parsed document.
 * @returns {string}
 */
function pageTitle(document) {
    return (
        document.summary?.title ||
        document.schematic?.sheet?.title ||
        document.pcb?.kicadBoard?.title ||
        stripKnownExtension(baseName(document.fileName))
    )
}

/**
 * Counts schematic page records.
 * @param {object[]} pages Project pages.
 * @returns {number}
 */
function schematicPageCount(pages) {
    return pages.filter((page) => page.kind === 'schematic').length
}

/**
 * Builds a child sheet path segment.
 * @param {string} parentPath Parent path.
 * @param {object} sheet Sheet symbol.
 * @param {number} index Sheet index.
 * @returns {string}
 */
function childSheetPath(parentPath, sheet, index) {
    const segment = String(
        sheet.ownerIndex || sheet.name || `sheet-${index + 1}`
    )
    return `${parentPath === '/' ? '' : parentPath}/${segment}`
}

/**
 * Returns a slash-normalized directory name.
 * @param {string} path File path.
 * @returns {string}
 */
function dirName(path) {
    const normalized = String(path || '').replace(/\\/g, '/')
    const index = normalized.lastIndexOf('/')
    return index >= 0 ? normalized.slice(0, index) : ''
}

/**
 * Joins an archive directory and file path.
 * @param {string} directory Directory path.
 * @param {string} fileName File name.
 * @returns {string}
 */
function joinEntryPath(directory, fileName) {
    if (!directory) return fileName
    return `${directory}/${fileName}`
}

/**
 * Normalizes an archive entry path for lookup.
 * @param {string} path Entry path.
 * @returns {string}
 */
function normalizeEntryPath(path) {
    return String(path || '')
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/\/+/g, '/')
        .toLowerCase()
}

/**
 * Returns a path basename.
 * @param {string} path File path.
 * @returns {string}
 */
function baseName(path) {
    return (
        String(path || '')
            .split('/')
            .pop() || ''
    )
}

/**
 * Strips a known KiCad extension.
 * @param {string} fileName File name.
 * @returns {string}
 */
function stripKnownExtension(fileName) {
    return String(fileName || '').replace(
        /\.(?:kicad_pro|kicad_sch|kicad_pcb)$/i,
        ''
    )
}
