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
                linkedJobCount: jobs.filter((job) => job.destinationId).length
            },
            diagnostics: [],
            jobsets: jobsets.map(jobsetSummary),
            destinations,
            jobs,
            jobsByDestination,
            destinationsById: indexBy(destinations, 'id'),
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
