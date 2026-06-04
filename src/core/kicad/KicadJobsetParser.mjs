// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'

/**
 * Parses KiCad .kicad_jobset JSON files.
 */
export class KicadJobsetParser {
    /**
     * Parses a KiCad jobset source document.
     * @param {string} source Jobset JSON source.
     * @param {{ fileName?: string }} [options] Parser options.
     * @returns {object}
     */
    static parse(source, options = {}) {
        const rawJobset = JSON.parse(String(source || '{}'))
        const fileName = String(options.fileName || '')
        const jobs = arrayOf(rawJobset.jobs).map(parseJob)
        const outputs = arrayOf(rawJobset.outputs).map(parseOutput)

        return NormalizedModelSchema.attach({
            sourceFormat: 'kicad',
            kind: 'jobset',
            fileType: 'kicad_jobset',
            fileName,
            summary: {
                title: stripExtension(baseName(fileName)) || 'KiCad jobset',
                jobCount: jobs.length,
                outputCount: outputs.length
            },
            diagnostics: [],
            meta: rawJobset.meta || {},
            jobs,
            outputs,
            rawJobset,
            bom: []
        })
    }
}

/**
 * Parses one jobset job row.
 * @param {object} job Raw job row.
 * @returns {object}
 */
function parseJob(job) {
    return {
        id: String(job?.id || ''),
        type: String(job?.type || ''),
        description: String(job?.description || ''),
        output: String(job?.output || job?.destination || ''),
        settings: job?.settings || {},
        rawJob: job || {}
    }
}

/**
 * Parses one jobset output row.
 * @param {object} output Raw output row.
 * @returns {object}
 */
function parseOutput(output) {
    return {
        id: String(output?.id || ''),
        type: String(output?.type || ''),
        description: String(output?.description || ''),
        settings: output?.settings || {},
        rawOutput: output || {}
    }
}

/**
 * Returns an array or empty fallback.
 * @param {unknown} value Candidate array.
 * @returns {unknown[]}
 */
function arrayOf(value) {
    return Array.isArray(value) ? value : []
}

/**
 * Returns a slash-normalized basename.
 * @param {string} path Source path.
 * @returns {string}
 */
function baseName(path) {
    return (
        String(path || '')
            .replace(/\\/g, '/')
            .split('/')
            .pop() || ''
    )
}

/**
 * Removes the last extension from a file name.
 * @param {string} fileName Source file name.
 * @returns {string}
 */
function stripExtension(fileName) {
    return String(fileName || '').replace(/\.[^.]+$/, '')
}
