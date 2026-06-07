// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadJobsetDigestBuilder } from './KicadJobsetDigestBuilder.mjs'

const schemaId = 'kicad-toolkit.project.output-digest.a1'

/**
 * Builds Altium OutJob-style output digests from KiCad jobset metadata.
 */
export class KicadProjectOutputDigestBuilder {
    /**
     * Builds a deterministic project output digest.
     * @param {{ jobsetDigest?: object, jobsets?: object[], projectModel?: object } | object} [input] Output context.
     * @returns {object}
     */
    static build(input = {}) {
        const jobsetDigest = resolveJobsetDigest(input)
        const projectModel = input?.projectModel || input?.project || {}
        const defaultDocumentPath = defaultPcbDocumentPath(projectModel)
        const outputGroups = outputGroupRows(jobsetDigest, defaultDocumentPath)
        const outputs = outputGroups.flatMap((group) => group.outputs)
        const expectedArtifacts = expectedArtifactsFor(outputGroups)

        return {
            schema: schemaId,
            summary: {
                jobsetCount: (jobsetDigest.jobsets || []).length,
                outputGroupCount: outputGroups.length,
                outputCount: outputs.length,
                typedOutputCount: outputs.filter(
                    (output) => output.normalizedType !== 'unsupported'
                ).length,
                unsupportedOutputCount: outputs.filter(
                    (output) => output.normalizedType === 'unsupported'
                ).length,
                expectedArtifactCount: expectedArtifacts.manifest.outputs.length
            },
            outputGroups,
            outputs,
            expectedArtifacts,
            outputsByDocumentPath: outputsByDocumentPath(outputs),
            outputsByDestinationId: outputsByDestinationId(outputGroups)
        }
    }
}

/**
 * Resolves a jobset digest from supported input shapes.
 * @param {object} input Build input.
 * @returns {object}
 */
function resolveJobsetDigest(input) {
    if (input?.schema === 'kicad-toolkit.project.output-digest.a1') return input
    if (input?.jobsetDigest) return input.jobsetDigest
    if (input?.kind === 'jobset-digest') return input
    return KicadJobsetDigestBuilder.build(input?.jobsets || input)
}

/**
 * Builds output groups keyed by KiCad destination.
 * @param {object} jobsetDigest Parsed jobset digest.
 * @param {string} defaultDocumentPath Default PCB document path.
 * @returns {object[]}
 */
function outputGroupRows(jobsetDigest, defaultDocumentPath) {
    const destinationsById = new Map(
        (jobsetDigest.destinations || []).map((destination) => [
            destination.id,
            destination
        ])
    )
    const groups = new Map()

    for (const job of jobsetDigest.jobs || []) {
        const destination =
            destinationsById.get(job.destinationId) || fallbackDestination(job)
        const groupKey = destination.id || 'destination-' + job.jobsetIndex
        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                destinationId: destination.id || '',
                name:
                    destination.description ||
                    destination.outputPath ||
                    groupKey,
                destinationType: destination.type || '',
                outputPath: destination.outputPath || '',
                outputs: []
            })
        }
        groups
            .get(groupKey)
            .outputs.push(outputRow(job, destination, defaultDocumentPath))
    }

    return [...groups.values()]
        .map((group) => ({
            ...group,
            outputCount: group.outputs.length,
            outputs: group.outputs.sort(compareOutputRows)
        }))
        .sort((left, right) =>
            String(left.destinationId || left.name).localeCompare(
                String(right.destinationId || right.name)
            )
        )
}

/**
 * Builds a fallback destination for unlinked jobs.
 * @param {object} job Job row.
 * @returns {object}
 */
function fallbackDestination(job) {
    return {
        id: job.destinationId || '',
        description: job.destinationDescription || '',
        type: job.destinationType || '',
        outputPath: job.outputPath || ''
    }
}

/**
 * Builds one normalized output row.
 * @param {object} job Job digest row.
 * @param {object} destination Destination row.
 * @param {string} defaultDocumentPath Default PCB path.
 * @returns {object}
 */
function outputRow(job, destination, defaultDocumentPath) {
    const documentPath = documentPathFor(job, defaultDocumentPath)
    return {
        key:
            'jobset-' +
            job.jobsetIndex +
            '-job-' +
            String(job.jobIndex).padStart(2, '0'),
        sourceFileName: job.sourceFileName,
        jobId: job.id,
        jobIndex: job.jobIndex,
        type: job.type,
        normalizedType: job.normalizedType,
        name: job.description || job.id || job.type,
        category: job.category,
        format: job.format,
        destinationId: destination.id || job.destinationId || '',
        destinationType: destination.type || job.destinationType || '',
        destinationDescription:
            destination.description || job.destinationDescription || '',
        outputPath: destination.outputPath || job.outputPath || '',
        normalizedDocumentPath: normalizePath(documentPath),
        settings: job.settings || {},
        unsupported: job.unsupported === true,
        expectedArtifact: expectedArtifactRow(job, destination, documentPath)
    }
}

/**
 * Resolves one job source document path.
 * @param {object} job Job row.
 * @param {string} defaultDocumentPath Default PCB path.
 * @returns {string}
 */
function documentPathFor(job, defaultDocumentPath) {
    const settings = job.settings || job.rawJob?.settings || {}
    return String(
        settings.document ||
            settings.documentPath ||
            settings.board ||
            settings.boardPath ||
            (job.category === 'fabrication' ? defaultDocumentPath : '') ||
            ''
    )
}

/**
 * Builds an expected artifact manifest.
 * @param {object[]} outputGroups Output groups.
 * @returns {object}
 */
function expectedArtifactsFor(outputGroups) {
    const outputs = outputGroups.flatMap((group) =>
        group.outputs.map((output) => output.expectedArtifact)
    )
    return {
        schema: 'kicad-toolkit.project.expected-artifacts.a1',
        summary: {
            outputCount: outputs.length,
            unsupportedOutputCount: outputs.filter((row) => row.unsupported)
                .length
        },
        manifest: { outputs }
    }
}

/**
 * Builds one expected artifact row.
 * @param {object} job Job row.
 * @param {object} destination Destination row.
 * @param {string} documentPath Source document path.
 * @returns {object}
 */
function expectedArtifactRow(job, destination, documentPath) {
    return {
        key:
            sourceGroup(job.sourceFileName) +
            '/' +
            String(job.jobIndex).padStart(2, '0') +
            '-' +
            slug(job.description || job.normalizedType || job.id),
        sourceFileName: job.sourceFileName,
        normalizedDocumentPath: normalizePath(documentPath),
        destinationId: destination.id || job.destinationId || '',
        destinationType: destination.type || job.destinationType || '',
        destinationDescription:
            destination.description || job.destinationDescription || '',
        outputPath: destination.outputPath || job.outputPath || '',
        jobId: job.id,
        jobType: job.type,
        jobDescription: job.description,
        normalizedType: job.normalizedType,
        category: job.category,
        format: job.format,
        unsupported: job.unsupported === true
    }
}

/**
 * Builds outputs keyed by document path.
 * @param {object[]} outputs Output rows.
 * @returns {Record<string, object[]>}
 */
function outputsByDocumentPath(outputs) {
    const groups = {}
    for (const output of outputs || []) {
        const path = output.normalizedDocumentPath
        if (!path) continue
        groups[path] ||= []
        groups[path].push(output)
    }
    return Object.fromEntries(Object.entries(groups).sort())
}

/**
 * Builds outputs keyed by destination id.
 * @param {object[]} outputGroups Output groups.
 * @returns {Record<string, object[]>}
 */
function outputsByDestinationId(outputGroups) {
    return Object.fromEntries(
        (outputGroups || [])
            .filter((group) => group.destinationId)
            .map((group) => [group.destinationId, group.outputs])
            .sort(([left], [right]) => left.localeCompare(right))
    )
}

/**
 * Resolves the default PCB document path from a project summary.
 * @param {object} projectModel Project model or loader result.
 * @returns {string}
 */
function defaultPcbDocumentPath(projectModel) {
    const project = projectModel?.project || projectModel || {}
    return String(
        (project.pages || []).find((page) => page.kind === 'pcb')?.fileName ||
            (project.pages || []).find((page) => page.kind === 'pcb')?.path ||
            ''
    )
}

/**
 * Normalizes path separators.
 * @param {unknown} path Source path.
 * @returns {string}
 */
function normalizePath(path) {
    return String(path || '').replace(/\\/g, '/')
}

/**
 * Builds a source group token.
 * @param {string} fileName Source file name.
 * @returns {string}
 */
function sourceGroup(fileName) {
    return slug(
        String(fileName || '')
            .replace(/\\/g, '/')
            .split('/')
            .pop()
            ?.replace(/\.[^.]+$/u, '') || 'jobset'
    )
}

/**
 * Builds a slug token.
 * @param {string} value Source value.
 * @returns {string}
 */
function slug(value) {
    return (
        String(value || '')
            .trim()
            .replace(/[^a-zA-Z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .toLowerCase() || 'unnamed'
    )
}

/**
 * Sorts output rows by source job position.
 * @param {object} left Left output row.
 * @param {object} right Right output row.
 * @returns {number}
 */
function compareOutputRows(left, right) {
    return Number(left.jobIndex || 0) - Number(right.jobIndex || 0)
}
