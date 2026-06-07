// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'

/**
 * Builds read-only jobset digests across parsed KiCad jobset models.
 */
export class KicadJobsetDigestBuilder {
    /**
     * Builds a digest of jobs, destinations, and destination lookups.
     * @param {object | object[]} input Parsed jobset, project result, or array.
     * @param {{ fileName?: string }} [options] Digest options.
     * @returns {object}
     */
    static build(input, options = {}) {
        const jobsets = resolveJobsets(input)
        const destinations = jobsets.flatMap(destinationRows)
        const jobs = jobsets.flatMap((jobset, jobsetIndex) =>
            jobRows(jobset, jobsetIndex)
        )
        const jobsByDestination = indexJobsByDestination(jobs)
        const expectedArtifacts = expectedArtifactsForJobs(jobs)

        return NormalizedModelSchema.attach({
            sourceFormat: 'kicad',
            kind: 'jobset-digest',
            fileType: 'KicadJobsetDigest',
            fileName: String(options.fileName || ''),
            summary: {
                title: 'KiCad jobset digest',
                jobsetCount: jobsets.length,
                jobCount: jobs.length,
                destinationCount: destinations.length,
                linkedJobCount: jobs.filter((job) => job.destinationId).length,
                expectedArtifactCount: expectedArtifacts.manifest.outputs.length
            },
            diagnostics: [],
            jobsets: jobsets.map(jobsetSummary),
            destinations,
            jobs,
            jobsByDestination,
            destinationsById: indexBy(destinations, 'id'),
            expectedArtifacts,
            bom: []
        })
    }
}

/**
 * Resolves parsed jobset models from supported input shapes.
 * @param {object | object[]} input Input value.
 * @returns {object[]}
 */
function resolveJobsets(input) {
    if (Array.isArray(input)) return input.filter(isJobset)
    if (isJobset(input)) return [input]
    if (Array.isArray(input?.jobsets)) return input.jobsets.filter(isJobset)
    if (isJobset(input?.jobset)) return [input.jobset]
    if (Array.isArray(input?.documents)) return input.documents.filter(isJobset)
    return []
}

/**
 * Returns true for parsed jobset-like models.
 * @param {unknown} value Candidate value.
 * @returns {boolean}
 */
function isJobset(value) {
    return (
        value &&
        (value.kind === 'jobset' ||
            Array.isArray(value.jobs) ||
            Array.isArray(value.outputs))
    )
}

/**
 * Builds one digest summary row.
 * @param {object} jobset Parsed jobset.
 * @param {number} jobsetIndex Jobset index.
 * @returns {object}
 */
function jobsetSummary(jobset, jobsetIndex) {
    return {
        jobsetIndex,
        fileName: String(jobset?.fileName || ''),
        jobCount: (jobset?.jobs || []).length,
        destinationCount: (jobset?.outputs || []).length
    }
}

/**
 * Builds destination rows for one jobset.
 * @param {object} jobset Parsed jobset.
 * @param {number} jobsetIndex Jobset index.
 * @returns {object[]}
 */
function destinationRows(jobset, jobsetIndex) {
    return (jobset?.outputs || []).map((destination, destinationIndex) => ({
        jobsetIndex,
        destinationIndex,
        sourceFileName: String(jobset?.fileName || ''),
        id: String(destination?.id || ''),
        type: String(destination?.type || ''),
        description: String(destination?.description || ''),
        outputPath: outputPath(destination),
        settings: destination?.settings || {},
        rawDestination: destination?.rawOutput || destination || {}
    }))
}

/**
 * Builds job rows for one jobset.
 * @param {object} jobset Parsed jobset.
 * @param {number} jobsetIndex Jobset index.
 * @returns {object[]}
 */
function jobRows(jobset, jobsetIndex) {
    const destinations = destinationRows(jobset, jobsetIndex)
    return (jobset?.jobs || []).map((job, jobIndex) => {
        const destinationId = String(job?.output || job?.destination || '')
        const destination =
            destinations.find((row) => row.id === destinationId) ||
            destinations.find((row) => row.description === destinationId) ||
            null

        return {
            jobsetIndex,
            jobIndex,
            sourceFileName: String(jobset?.fileName || ''),
            id: String(job?.id || ''),
            type: String(job?.type || ''),
            description: String(job?.description || ''),
            destinationId,
            destinationType: destination?.type || '',
            destinationDescription: destination?.description || '',
            outputPath: destination?.outputPath || '',
            ...jobTypeMetadata(job?.type),
            settings: job?.settings || {},
            rawJob: job?.rawJob || job || {}
        }
    })
}

/**
 * Extracts a destination output path from known KiCad jobset fields.
 * @param {object} destination Destination row.
 * @returns {string}
 */
function outputPath(destination) {
    const settings = destination?.settings || {}
    return String(
        settings.output_path ||
            settings.outputPath ||
            settings.path ||
            destination?.outputPath ||
            ''
    )
}

/**
 * Builds a job-id lookup keyed by destination id.
 * @param {object[]} jobs Job rows.
 * @returns {Record<string, string[]>}
 */
function indexJobsByDestination(jobs) {
    const byDestination = {}
    for (const job of jobs || []) {
        if (!job.destinationId) continue
        byDestination[job.destinationId] ||= []
        byDestination[job.destinationId].push(job.id)
    }
    return byDestination
}

/**
 * Builds a compact object index by a string field.
 * @param {object[]} rows Rows.
 * @param {string} field Field name.
 * @returns {Record<string, object>}
 */
function indexBy(rows, field) {
    const index = {}
    for (const row of rows || []) {
        const key = String(row?.[field] || '')
        if (key) index[key] = row
    }
    return index
}

/**
 * Builds an expected-artifact manifest from linked job rows.
 * @param {object[]} jobs Job digest rows.
 * @returns {object}
 */
function expectedArtifactsForJobs(jobs) {
    const outputs = (jobs || []).map((job) => expectedArtifactRow(job))

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
 * @param {object} job Job digest row.
 * @returns {object}
 */
function expectedArtifactRow(job) {
    return {
        key:
            sourceGroup(job.sourceFileName) +
            '/' +
            String(job.jobIndex).padStart(2, '0') +
            '-' +
            slug(job.description || job.normalizedType || job.id),
        sourceFileName: job.sourceFileName,
        destinationId: job.destinationId,
        destinationType: job.destinationType,
        destinationDescription: job.destinationDescription,
        outputPath: job.outputPath,
        jobId: job.id,
        jobType: job.type,
        jobDescription: job.description,
        normalizedType: job.normalizedType,
        category: job.category,
        format: job.format,
        unsupported: job.unsupported
    }
}

/**
 * Resolves normalized output metadata from a KiCad job type.
 * @param {unknown} type Raw KiCad job type.
 * @returns {{ normalizedType: string, category: string, format: string, unsupported: boolean }}
 */
function jobTypeMetadata(type) {
    const normalized = String(type || '').toLowerCase()
    if (normalized.includes('gerber')) {
        return outputMetadata('gerber', 'fabrication', 'gerber')
    }
    if (normalized.includes('drill')) {
        return outputMetadata('drill', 'fabrication', 'nc-drill')
    }
    if (
        normalized.includes('pos') ||
        normalized.includes('position') ||
        normalized.includes('pick')
    ) {
        return outputMetadata('pick-place', 'assembly', 'pick-place')
    }
    if (normalized.includes('bom')) {
        return outputMetadata('bom', 'report', 'bom')
    }
    if (normalized.includes('netlist')) {
        return outputMetadata('netlist', 'netlist', 'netlist')
    }
    if (normalized.includes('step') || normalized.includes('3d')) {
        return outputMetadata('step', 'export', 'step')
    }
    if (normalized.includes('pdf')) {
        return outputMetadata('pdf', 'documentation', 'pdf')
    }
    if (normalized === 'plot' || normalized.includes('plot')) {
        return outputMetadata('plot', 'fabrication', 'plot')
    }
    return outputMetadata('unsupported', 'unsupported', 'unknown', true)
}

/**
 * Builds output type metadata.
 * @param {string} normalizedType Normalized output type.
 * @param {string} category Output category.
 * @param {string} format Output format.
 * @param {boolean} [unsupported] Whether the job type is unsupported.
 * @returns {{ normalizedType: string, category: string, format: string, unsupported: boolean }}
 */
function outputMetadata(normalizedType, category, format, unsupported = false) {
    return { normalizedType, category, format, unsupported }
}

/**
 * Resolves the output group name from a source jobset file.
 * @param {string} sourceFileName Source file name.
 * @returns {string}
 */
function sourceGroup(sourceFileName) {
    return slug(
        String(sourceFileName || '')
            .split('/')
            .pop()
            .replace(/\.kicad_jobset$/iu, '')
    )
}

/**
 * Converts a value to a lowercase key segment.
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
