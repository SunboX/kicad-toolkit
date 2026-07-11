// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import {
    ToolkitAsset,
    ToolkitDiagnostic,
    ToolkitError,
    ToolkitProgress
} from 'circuitjson-toolkit/parser'
import {
    ArchiveEntryPath,
    ArchiveLimits,
    ProjectResult
} from 'circuitjson-toolkit/project'

import { KicadDocumentBuilder } from './KicadDocumentBuilder.mjs'
import { KicadAsyncInputOwnership } from './KicadAsyncInputOwnership.mjs'
import { KicadProjectArchive } from './KicadProjectArchive.mjs'
import { KicadWorkerClient } from './KicadWorkerClient.mjs'
import { Parser } from './Parser.mjs'
import { ParserInput } from './ParserInput.mjs'

const ABORTED_GETTER = Object.getOwnPropertyDescriptor(
    AbortSignal.prototype,
    'aborted'
)?.get
const PARSER_OPTION_KEYS = [
    'preserveRaw',
    'decodeAssets',
    'extensions',
    'reports',
    'retainSource',
    'worker',
    'transferInput',
    'signal',
    'onProgress'
]
const EXTENSION_IDS = new Set([
    'kicad.native-model',
    'kicad.project-context',
    'kicad.entry-order',
    'kicad.archive'
])

/** Loads app-shaped KiCad entries into canonical project envelopes. */
export class ProjectLoader {
    /** @param {object[]} entries Entries. @param {object} [options] Options. @returns {object} Project. */
    static load(entries, options = {}) {
        try {
            const normalized = ProjectLoader.#normalizeOptions(options)
            if (normalized.worker === true) {
                throw ProjectLoader.#error(
                    'Synchronous KiCad project loading cannot use a worker.',
                    'ERR_WORKER_SYNC_UNAVAILABLE',
                    'unsupported'
                )
            }
            ProjectLoader.#assertNotCancelled(normalized.signal)
            const snapshot = ProjectLoader.#snapshotEntries(
                entries,
                normalized.archiveLimits.maxEntries,
                normalized.decodeAssets
            )
            const classified = ProjectLoader.#classify(snapshot, normalized)
            ProjectLoader.#assertNotCancelled(normalized.signal)
            return ProjectLoader.#build(classified, normalized, entries)
        } catch (error) {
            throw ProjectLoader.#loadError(error)
        }
    }

    /** @param {object[]} entries Entries. @param {object} [options] Options. @returns {object} Result. */
    static tryLoad(entries, options = {}) {
        try {
            return { ok: true, value: ProjectLoader.load(entries, options) }
        } catch (error) {
            const normalized = ProjectLoader.#loadError(error)
            return {
                ok: false,
                error: normalized,
                diagnostics: [
                    ToolkitDiagnostic.create({
                        code: normalized.code,
                        severity: 'error',
                        message: normalized.message,
                        source: normalized.source
                    })
                ]
            }
        }
    }

    /** @param {object[]} entries Entries. @param {object} [options] Options. @returns {Promise<object>} Project. */
    static async loadAsync(entries, options = {}) {
        let normalized
        let snapshot
        const entriesOwned = KicadAsyncInputOwnership.ownsProject(entries)
        try {
            normalized = ProjectLoader.#normalizeOptions(options)
            ProjectLoader.#assertNotCancelled(normalized.signal)
            snapshot = entriesOwned
                ? ProjectLoader.#markReceiverEntries(
                      entries,
                      normalized.archiveLimits.maxEntries
                  )
                : ProjectLoader.#snapshotEntries(
                      entries,
                      normalized.archiveLimits.maxEntries,
                      normalized.decodeAssets
                  )
        } catch (error) {
            throw ProjectLoader.#inputError(error)
        }
        const useWorker =
            normalized.worker === true ||
            (normalized.worker === 'auto' &&
                normalized.retainSource !== 'reference' &&
                KicadWorkerClient.isAvailable())
        if (useWorker) {
            const attempt = await KicadWorkerClient.loadProjectAttempt(
                snapshot,
                normalized
            )
            if (attempt.ok) return attempt.value
            if (normalized.worker !== 'auto' || !attempt.unavailable) {
                throw ProjectLoader.#loadError(attempt.error)
            }
            KicadWorkerClient.dispose()
        }
        let progress = ProjectLoader.#progress(normalized, {
            stage: 'detect',
            completed: 0,
            total: 0,
            message: 'Detecting KiCad project entries.'
        })
        await ProjectLoader.#yieldTurn()
        ProjectLoader.#assertNotCancelled(normalized.signal)
        let classified
        try {
            classified = ProjectLoader.#classify(snapshot, normalized)
        } catch (error) {
            throw ProjectLoader.#inputError(error)
        }
        progress = ProjectLoader.#progress(
            normalized,
            {
                stage: 'project',
                completed: 0,
                total: classified.candidates.length,
                message: 'Loading KiCad project entries.'
            },
            progress
        )
        const state = ProjectLoader.#buildState()
        for (let index = 0; index < classified.candidates.length; index += 1) {
            await ProjectLoader.#yieldTurn()
            ProjectLoader.#assertNotCancelled(normalized.signal)
            ProjectLoader.#parseCandidate(
                classified.candidates[index],
                classified,
                normalized,
                entries,
                state
            )
            progress = ProjectLoader.#progress(
                normalized,
                {
                    stage: 'project',
                    completed: index + 1,
                    total: classified.candidates.length,
                    detail: classified.candidates[index].name,
                    message: 'Loaded KiCad project entry.'
                },
                progress
            )
        }
        const project = ProjectLoader.#finish(classified, normalized, state)
        ProjectLoader.#progress(
            normalized,
            {
                stage: 'complete',
                completed: classified.candidates.length,
                total: classified.candidates.length,
                message: 'KiCad project loading complete.'
            },
            progress
        )
        ProjectLoader.#assertNotCancelled(normalized.signal)
        return project
    }

    /** @param {unknown} entries Entries. @returns {boolean} Support. */
    static supports(entries) {
        try {
            const options = ProjectLoader.#normalizeOptions({
                worker: false,
                decodeAssets: 'none',
                extensions: 'none'
            })
            const snapshot = ProjectLoader.#snapshotEntries(
                entries,
                options.archiveLimits.maxEntries,
                options.decodeAssets
            )
            return (
                ProjectLoader.#classify(snapshot, options).candidates.length > 0
            )
        } catch {
            return false
        }
    }

    /** @param {unknown} options Options. @returns {object} Normalized options. */
    static #normalizeOptions(options) {
        try {
            const fields = ParserInput.plainFields(
                options,
                'KiCad project options must be a plain object.'
            )
            const parserOptions = {}
            for (const key of PARSER_OPTION_KEYS) {
                if (Object.hasOwn(fields, key)) parserOptions[key] = fields[key]
            }
            const normalized = ParserInput.normalize(
                { fileName: 'project.kicad_pcb', data: '' },
                parserOptions
            ).options
            ProjectLoader.#assertExtensions(normalized.extensions)
            if (normalized.signal !== undefined && normalized.signal !== null) {
                ProjectLoader.#signalState(normalized.signal)
            }
            return {
                ...normalized,
                archiveLimits: ArchiveLimits.normalize(fields.archiveLimits)
            }
        } catch (error) {
            throw ProjectLoader.#inputError(error)
        }
    }

    /**
     * Owns project names, bytes, and assets before callbacks or async turns.
     * @param {unknown} entries Caller entries.
     * @param {number} maximumEntries Configured entry ceiling.
     * @param {'none' | 'metadata' | 'full'} assetMode Asset ownership mode.
     * @returns {Record<string, any>[]} Stable entry snapshots.
     */
    static #snapshotEntries(entries, maximumEntries, assetMode) {
        const descriptors = ProjectLoader.#entryArray(entries)
        const count = descriptors.length.value
        ProjectLoader.#assertLimit('maxEntries', maximumEntries, count)
        const snapshot = new Array(count)
        for (let index = 0; index < count; index += 1) {
            const fields = ParserInput.plainFields(
                descriptors[String(index)].value,
                'KiCad project entry must be a plain object.'
            )
            const rawName = ParserInput.fileName(fields.name)
            if (!rawName) {
                throw ProjectLoader.#inputError(
                    new TypeError(
                        'KiCad project entry names must be non-empty safe scalars.'
                    )
                )
            }
            if (!ParserInput.isData(fields.data)) {
                throw ProjectLoader.#inputError(
                    new TypeError('KiCad project entry data is invalid.'),
                    rawName
                )
            }
            let assetBytes = 0
            const preparedAssets = ToolkitAsset.prepareAll(
                fields.assets || [],
                {
                    mode: assetMode,
                    acceptPayload: (byteLength) => {
                        assetBytes += byteLength
                    }
                }
            )
            snapshot[index] = {
                name: ArchiveEntryPath.normalize(rawName),
                data:
                    typeof fields.data === 'string'
                        ? fields.data
                        : ParserInput.bytes(fields.data),
                assets: preparedAssets,
                assetBytes
            }
        }
        return snapshot
    }

    /**
     * Validates structured-cloned entries as receiver-owned snapshots.
     * @param {unknown} entries Worker-received entries.
     * @param {number} maximumEntries Configured entry ceiling.
     * @returns {Record<string, any>[]} Same dense array.
     */
    static #markReceiverEntries(entries, maximumEntries) {
        const descriptors = ProjectLoader.#entryArray(entries)
        const count = descriptors.length.value
        ProjectLoader.#assertLimit('maxEntries', maximumEntries, count)
        for (let index = 0; index < count; index += 1) {
            ParserInput.plainFields(
                descriptors[String(index)].value,
                'KiCad project entry must be a plain object.'
            )
        }
        return entries
    }

    /** @param {unknown} entries Entries. @param {object} options Options. @returns {object} Classified entries. */
    static #classify(entries, options) {
        const descriptors = ProjectLoader.#entryArray(entries)
        const count = descriptors.length.value
        if (!count) {
            throw ProjectLoader.#inputError(
                new TypeError('KiCad project entries must be nonempty.')
            )
        }
        ProjectLoader.#assertLimit(
            'maxEntries',
            options.archiveLimits.maxEntries,
            count
        )
        const expanded = []
        const attachedAssets = []
        const originalNames = []
        let totalBytes = 0
        let expandedBytes = 0
        let archiveExpanded = false
        for (let index = 0; index < count; index += 1) {
            const fields = ParserInput.plainFields(
                descriptors[String(index)].value,
                'KiCad project entry must be a plain object.'
            )
            const name = ArchiveEntryPath.normalize(fields.name)
            originalNames.push(name)
            if (!ParserInput.isData(fields.data)) {
                throw ProjectLoader.#inputError(
                    new TypeError('KiCad project entry data is invalid.'),
                    name
                )
            }
            const bytes =
                typeof fields.data === 'string'
                    ? ParserInput.bytes(fields.data)
                    : fields.data
            ProjectLoader.#assertLimit(
                'maxEntryBytes',
                options.archiveLimits.maxEntryBytes,
                bytes.byteLength,
                name
            )
            totalBytes += bytes.byteLength
            ProjectLoader.#assertLimit(
                'maxTotalBytes',
                options.archiveLimits.maxTotalBytes,
                totalBytes,
                name
            )
            if (
                !Array.isArray(fields.assets) ||
                !Number.isSafeInteger(fields.assetBytes) ||
                fields.assetBytes < 0
            ) {
                throw ProjectLoader.#inputError(
                    new TypeError(
                        'KiCad project entry asset snapshots are invalid.'
                    ),
                    name
                )
            }
            const entryBytes = bytes.byteLength + fields.assetBytes
            totalBytes += fields.assetBytes
            ProjectLoader.#assertLimit(
                'maxEntryBytes',
                options.archiveLimits.maxEntryBytes,
                entryBytes,
                name
            )
            ProjectLoader.#assertLimit(
                'maxTotalBytes',
                options.archiveLimits.maxTotalBytes,
                totalBytes,
                name
            )
            attachedAssets.push(...fields.assets)
            if (/\.zip$/iu.test(name)) {
                archiveExpanded = true
                for (const member of KicadProjectArchive.expand(
                    name,
                    bytes,
                    options.archiveLimits,
                    {
                        baseEntryCount: expanded.length,
                        baseTotalBytes: totalBytes
                    }
                )) {
                    totalBytes += member.bytes.byteLength
                    expandedBytes += member.bytes.byteLength
                    ProjectLoader.#assertLimit(
                        'maxTotalBytes',
                        options.archiveLimits.maxTotalBytes,
                        totalBytes,
                        member.name
                    )
                    expanded.push(member)
                }
            } else {
                expanded.push({
                    name,
                    bytes,
                    assets: fields.assets,
                    archiveDepth: 0
                })
            }
        }
        ProjectLoader.#assertLimit(
            'maxEntries',
            options.archiveLimits.maxEntries,
            expanded.length
        )
        const names = ArchiveEntryPath.unique(
            expanded.map((entry) => entry.name)
        )
        for (let index = 0; index < names.length; index += 1) {
            expanded[index].name = names[index]
        }
        const candidates = expanded.filter((entry) =>
            Parser.supports({ fileName: entry.name, data: entry.bytes })
        )
        if (!candidates.length) {
            throw ProjectLoader.#error(
                'KiCad project contains no supported document entries.',
                'ERR_FORMAT_UNSUPPORTED',
                'unsupported'
            )
        }
        const projectEntries = expanded.filter((entry) =>
            /\.kicad_pro$/iu.test(entry.name)
        )
        const consumed = new Set(candidates)
        return {
            originalCount: count,
            originalNames,
            entries: expanded,
            candidates,
            projectEntries,
            companions: expanded.filter((entry) => !consumed.has(entry)),
            entryNames: names,
            attachedAssets,
            totalBytes,
            expandedBytes,
            archiveExpanded
        }
    }

    /** @param {object} classified Classified entries. @param {object} options Options. @param {unknown} sourceReference Source. @returns {object} Project. */
    static #build(classified, options, sourceReference) {
        const state = ProjectLoader.#buildState()
        for (const entry of classified.candidates) {
            ProjectLoader.#assertNotCancelled(options.signal)
            ProjectLoader.#parseCandidate(
                entry,
                classified,
                options,
                sourceReference,
                state
            )
        }
        return ProjectLoader.#finish(classified, options, state)
    }

    /**
     * Creates mutable state shared by sync and incremental loading.
     * @returns {{ documents: object[], diagnostics: object[], failureCount: number, successfulCandidateCount: number }} Build state.
     */
    static #buildState() {
        return {
            documents: [],
            diagnostics: [],
            failureCount: 0,
            successfulCandidateCount: 0
        }
    }

    /**
     * Parses one candidate with deterministic partial-success behavior.
     * @param {{ name: string, bytes: Uint8Array }} entry Candidate entry.
     * @param {object} classified Classified entries.
     * @param {object} options Options.
     * @param {unknown} sourceReference Original caller entries.
     * @param {{ documents: object[], diagnostics: object[], failureCount: number, successfulCandidateCount: number }} state Build state.
     * @returns {void}
     */
    static #parseCandidate(entry, classified, options, sourceReference, state) {
        ProjectLoader.#assertNotCancelled(options.signal)
        try {
            const document = KicadDocumentBuilder.build(
                ProjectLoader.#documentRequest(
                    entry.name,
                    options,
                    sourceReference,
                    entry.bytes,
                    ProjectLoader.#modelAssetNames(classified),
                    ProjectLoader.#projectRoot(
                        entry.name,
                        classified.projectEntries
                    )
                )
            )
            state.documents.push(document)
            state.diagnostics.push(...(document.diagnostics || []))
            state.successfulCandidateCount += 1
        } catch (error) {
            state.failureCount += 1
            const normalized = ProjectLoader.#loadError(error, entry.name)
            state.diagnostics.push(
                ToolkitDiagnostic.create({
                    code: normalized.code,
                    severity: 'error',
                    message: normalized.message,
                    source: entry.name,
                    details: {
                        category: normalized.category,
                        format: normalized.format
                    }
                })
            )
        }
    }

    /**
     * Materializes one canonical project after candidate parsing completes.
     * @param {object} classified Classified entries.
     * @param {object} options Options.
     * @param {{ documents: object[], diagnostics: object[], failureCount: number, successfulCandidateCount: number }} state Build state.
     * @returns {object} Project result.
     */
    static #finish(classified, options, state) {
        if (!state.successfulCandidateCount) {
            throw ProjectLoader.#error(
                'KiCad project could not parse any supported document entries.',
                'ERR_KICAD_PROJECT',
                'parse',
                '',
                { failureCount: state.failureCount }
            )
        }
        const companionAssets = ToolkitAsset.prepareAll(
            classified.companions.map((entry) => ({
                name: entry.name,
                data: entry.bytes,
                kind: 'companion'
            })),
            { mode: options.decodeAssets }
        )
        const assets = [...classified.attachedAssets, ...companionAssets]
        const name =
            classified.projectEntries[0]?.name ||
            state.documents[0]?.source?.fileName ||
            'kicad-project'
        const extension = ProjectLoader.#extension(
            classified,
            options,
            state.documents,
            name
        )
        return ProjectResult.create({
            source: { format: 'kicad', entryNames: classified.originalNames },
            documents: state.documents,
            project: {
                name,
                format: 'kicad',
                relationships: []
            },
            extensions: extension ? { kicad: extension } : {},
            assets,
            diagnostics: state.diagnostics,
            statistics: {
                entryCount: classified.originalCount,
                candidateCount: classified.candidates.length,
                failureCount: state.failureCount,
                totalBytes: classified.totalBytes,
                inputEntryCount: classified.originalCount,
                expandedEntryCount: classified.entries.length,
                expandedBytes: classified.expandedBytes,
                parsedEntryCount: state.successfulCandidateCount,
                documentCount: state.documents.length,
                assetCount: assets.length,
                byteLength: classified.totalBytes
            }
        })
    }

    /** @param {object} classified Classified entries. @returns {string[]} Exact model asset names. */
    static #modelAssetNames(classified) {
        return [
            ...new Set([
                ...classified.companions.map((entry) => entry.name),
                ...classified.attachedAssets.map((asset) => asset.name)
            ])
        ]
    }

    /**
     * Returns the nearest owning `.kicad_pro` directory for one document.
     * @param {string} fileName Document path.
     * @param {object[]} projectEntries Project metadata entries.
     * @returns {string | null} Canonical project root or null.
     */
    static #projectRoot(fileName, projectEntries) {
        const normalizedName = String(fileName).replaceAll('\\', '/')
        const roots = projectEntries
            .map((entry) =>
                String(entry.name)
                    .replaceAll('\\', '/')
                    .split('/')
                    .slice(0, -1)
                    .join('/')
            )
            .filter(
                (root) =>
                    !root ||
                    normalizedName === root ||
                    normalizedName.startsWith(`${root}/`)
            )
            .sort((left, right) => right.length - left.length)
        return roots.length ? roots[0] : null
    }

    /** @param {string} fileName Name. @param {object} options Options. @param {unknown} sourceReference Source. @param {Uint8Array} [data] Data. @param {string[]} [modelAssetNames] Model asset names. @param {string | null} [projectRoot] Project root. @returns {object} Request. */
    static #documentRequest(
        fileName,
        options,
        sourceReference,
        data = new Uint8Array(),
        modelAssetNames = [],
        projectRoot = null
    ) {
        return {
            input: { fileName, data, assets: [] },
            sourceReference,
            projectAssetNames: modelAssetNames,
            projectRoot,
            inputOwned: true,
            options: { ...options, worker: false, onProgress: undefined }
        }
    }

    /** @param {object} classified Entries. @param {object} options Options. @param {object[]} documents Documents. @param {string} projectName Project name. @returns {object | null} Extension. */
    static #extension(classified, options, documents, projectName) {
        const none =
            options.extensions === 'none' ||
            (Array.isArray(options.extensions) && !options.extensions.length)
        if (none) return null
        const selected = Array.isArray(options.extensions)
            ? options.extensions
            : ['kicad.entry-order', 'kicad.archive', 'kicad.project-context']
        const includeProject = selected.includes('kicad.project-context')
        const schematicDocuments = documents.filter(
            (document) => document.source?.fileType === 'kicad_sch'
        )
        return {
            $meta: {
                schema: 'ecad-toolkit.extension.v1',
                completeness: Array.isArray(options.extensions)
                    ? 'canonical'
                    : options.extensions,
                included: selected,
                omitted: []
            },
            entryNames: classified.entryNames,
            archiveExpanded: classified.archiveExpanded,
            ...(includeProject
                ? {
                      projectContext: {
                          name: projectName,
                          rootSchematic:
                              schematicDocuments[0]?.source?.fileName || '',
                          pageCount: schematicDocuments.length,
                          netCount: documents.reduce(
                              (count, document) =>
                                  count +
                                  document.model.filter(
                                      (row) => row.type === 'source_net'
                                  ).length,
                              0
                          )
                      }
                  }
                : {})
        }
    }

    /** @param {unknown} value Entries. @returns {Record<string, PropertyDescriptor>} Descriptors. */
    static #entryArray(value) {
        if (!Array.isArray(value)) {
            throw ProjectLoader.#inputError(
                new TypeError('KiCad project entries must be a dense array.')
            )
        }
        let prototype
        let descriptors
        try {
            prototype = Object.getPrototypeOf(value)
            descriptors = Object.getOwnPropertyDescriptors(value)
        } catch {
            throw ProjectLoader.#inputError(
                new TypeError('KiCad project entries could not be inspected.')
            )
        }
        const length = descriptors.length?.value
        if (
            prototype !== Array.prototype ||
            !Number.isSafeInteger(length) ||
            length < 0 ||
            Reflect.ownKeys(descriptors).length !== length + 1
        ) {
            throw ProjectLoader.#inputError(
                new TypeError('KiCad project entries must be a dense array.')
            )
        }
        for (let index = 0; index < length; index += 1) {
            const descriptor = descriptors[String(index)]
            if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
                throw ProjectLoader.#inputError(
                    new TypeError('KiCad project entries require data fields.')
                )
            }
        }
        if (Object.hasOwn(descriptors, Symbol.iterator)) {
            throw ProjectLoader.#inputError(
                new TypeError('KiCad project entries use standard iteration.')
            )
        }
        return descriptors
    }

    /** @param {string | string[]} extensions Extensions. @returns {void} */
    static #assertExtensions(extensions) {
        if (!Array.isArray(extensions)) return
        const unknown = extensions.find((id) => !EXTENSION_IDS.has(id))
        if (!unknown) return
        throw ProjectLoader.#error(
            `KiCad project extension is unavailable: ${unknown}.`,
            'ERR_CAPABILITY_UNAVAILABLE',
            'unsupported',
            '',
            { extensions }
        )
    }

    /** @param {string} limit Limit. @param {number} maximum Maximum. @param {number} actual Actual. @param {string} [source] Source. @returns {void} */
    static #assertLimit(limit, maximum, actual, source = '') {
        if (actual <= maximum) return
        throw ProjectLoader.#limitError(limit, maximum, actual, source)
    }

    /** @param {string} limit Limit. @param {number} maximum Maximum. @param {number} actual Actual. @param {string} source Source. @returns {ToolkitError} Error. */
    static #limitError(limit, maximum, actual, source) {
        return ProjectLoader.#error(
            `KiCad archive limit exceeded: ${limit}.`,
            'ERR_ARCHIVE_LIMIT_EXCEEDED',
            'validation',
            source,
            { limit, maximum, actual }
        )
    }

    /** @param {object} options Options. @param {object} fields Fields. @param {object | null} [previous] Previous. @returns {object | null} Row. */
    static #progress(options, fields, previous = null) {
        if (!options.onProgress) return previous
        const row = ToolkitProgress.create(fields, previous)
        options.onProgress(row)
        return row
    }

    /** @returns {Promise<void>} Host turn. */
    static async #yieldTurn() {
        await new Promise((resolve) => setTimeout(resolve, 0))
    }

    /** @param {unknown} signal Signal. @returns {boolean} State. */
    static #signalState(signal) {
        if (!ABORTED_GETTER) throw new TypeError('AbortSignal is unavailable.')
        try {
            return Boolean(Reflect.apply(ABORTED_GETTER, signal, []))
        } catch {
            throw new TypeError('KiCad signal must be an AbortSignal.')
        }
    }

    /** @param {unknown} signal Signal. @returns {void} */
    static #assertNotCancelled(signal) {
        if (signal === undefined || signal === null) return
        if (!ProjectLoader.#signalState(signal)) return
        throw ProjectLoader.#error(
            'KiCad project loading was cancelled.',
            'ERR_CANCELLED',
            'cancelled'
        )
    }

    /** @param {unknown} error Failure. @param {string} [source] Source. @returns {ToolkitError} Error. */
    static #inputError(error, source = '') {
        if (ToolkitError.trustedRecord(error)) return error
        return ToolkitError.from(error, {
            code: 'ERR_PROJECT_INPUT',
            category: 'validation',
            format: 'kicad',
            source
        })
    }

    /** @param {unknown} error Failure. @param {string} [source] Source. @returns {ToolkitError} Error. */
    static #loadError(error, source = '') {
        if (ToolkitError.trustedRecord(error)) return error
        return ToolkitError.from(error, {
            code: 'ERR_KICAD_PROJECT',
            category: 'parse',
            format: 'kicad',
            source
        })
    }

    /** @param {string} message Message. @param {string} code Code. @param {string} category Category. @param {string} [source] Source. @param {object} [details] Details. @returns {ToolkitError} Error. */
    static #error(message, code, category, source = '', details = {}) {
        return new ToolkitError(message, {
            code,
            category,
            format: 'kicad',
            source,
            details
        })
    }
}

Object.freeze(ProjectLoader.prototype)
Object.freeze(ProjectLoader)
