// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual, promisify } from 'node:util'

import { KicadConvergenceBenchmark } from '../benchmarks/KicadConvergenceBenchmark.mjs'

const execFileAsync = promisify(execFile)
const repositoryRoot = new URL('../', import.meta.url)
const BASE_GIT_REF = 'c71c88d69d236accce123656dfa66914c0d5489c'

/**
 * Runs Git relative to the repository root.
 * @param {string[]} args Git arguments.
 * @returns {Promise<string>} Trimmed stdout.
 */
async function git(args) {
    const { stdout } = await execFileAsync('git', args, {
        cwd: repositoryRoot,
        maxBuffer: 8 * 1024 * 1024
    })
    return stdout.trim()
}

/**
 * Returns the value after one command-line flag.
 * @param {string[]} args Command arguments.
 * @param {string} flag Flag name.
 * @returns {string} Flag value or an empty string.
 */
function flagValue(args, flag) {
    const index = args.indexOf(flag)
    return index < 0 ? '' : String(args[index + 1] || '')
}

/**
 * Resolves a repository-confined benchmark record path.
 * @param {string} recordPath Requested relative path.
 * @param {string | URL} [root] Repository root.
 * @returns {string} Absolute output path.
 */
export function resolveRecordPath(recordPath, root = repositoryRoot) {
    const rootPath = resolve(
        root instanceof URL ? fileURLToPath(root) : String(root)
    )
    if (!recordPath || isAbsolute(recordPath)) {
        throw new Error(
            '--record requires a repository-relative path inside the repository.'
        )
    }
    const outputPath = resolve(rootPath, recordPath)
    const relativePath = relative(rootPath, outputPath)
    if (
        relativePath === '..' ||
        relativePath.startsWith(`..${sep}`) ||
        isAbsolute(relativePath)
    ) {
        throw new Error(
            '--record requires a repository-relative path inside the repository.'
        )
    }
    return outputPath
}

/**
 * Returns a SHA-256 checksum for a report body.
 * @param {Record<string, any>} report Report without checksum.
 * @returns {string} Report checksum.
 */
export function reportChecksum(report) {
    return createHash('sha256').update(JSON.stringify(report)).digest('hex')
}

/**
 * Returns the stable six-decimal median for samples.
 * @param {number[]} samples Timing samples.
 * @returns {number} Median value.
 */
function median(samples) {
    const sorted = [...samples].sort((left, right) => left - right)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 1
        ? sorted[middle]
        : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(6))
}

/**
 * Validates one immutable case measurement.
 * @param {Record<string, any>} row Case row.
 * @returns {boolean} Whether the measurement reconciles.
 */
function validMeasurement(row) {
    const samples = Array.isArray(row.samples) ? row.samples : []
    const heap = row.retainedHeap || {}
    return (
        Number.isInteger(row.sampleCount) &&
        row.sampleCount > 0 &&
        samples.length === row.sampleCount &&
        samples.every((sample) => Number.isFinite(sample) && sample >= 0) &&
        row.medianMilliseconds === median(samples) &&
        Number.isInteger(row.cloneBytes) &&
        row.cloneBytes >= 0 &&
        row.resultChecksum ===
            createHash('sha256')
                .update(JSON.stringify(row.result))
                .digest('hex') &&
        heap.gcControlled === true &&
        [heap.beforeBytes, heap.afterBytes, heap.retainedBytes].every(
            (value) => Number.isInteger(value) && value >= 0
        ) &&
        heap.retainedBytes === Math.max(0, heap.afterBytes - heap.beforeBytes)
    )
}

/**
 * Validates an existing immutable benchmark report.
 * @param {Record<string, any>} report Existing report.
 * @param {{ packageVersion: string, gitRef: string, sourceTree: string }} identity Expected identity.
 * @returns {void}
 */
export function validateExistingReport(report, identity) {
    const { reportChecksum: checksum, ...body } = report
    const definitions = KicadConvergenceBenchmark.cases()
    const contracts = (report.cases || []).map((row) => ({
        id: row.id,
        primary: row.primary,
        warmups: row.warmups,
        samples: row.sampleCount,
        workload: row.workload
    }))
    const expectedContracts = definitions.map((row) => ({ ...row }))
    const primary = (report.cases || [])
        .filter((row) => row.primary)
        .map((row) => row.id)
    if (
        report.schema !== 'kicad-toolkit.benchmark.v1' ||
        report.packageVersion !== identity.packageVersion ||
        report.gitRef !== identity.gitRef ||
        report.sourceTree !== identity.sourceTree ||
        !isDeepStrictEqual(contracts, expectedContracts) ||
        !isDeepStrictEqual(primary, [
            'parse.large-board',
            'render.multi-layer',
            'worker.clone'
        ]) ||
        !(report.cases || []).every(validMeasurement) ||
        checksum !== reportChecksum(body)
    ) {
        throw new Error(
            'Existing benchmark baseline differs from the approved contract.'
        )
    }
}

/**
 * Reads an existing report or returns null when absent.
 * @param {string} path Report path.
 * @returns {Promise<Record<string, any> | null>} Existing report.
 */
async function readExisting(path) {
    try {
        return JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
        if (error?.code === 'ENOENT') return null
        throw error
    }
}

/**
 * Runs or reads back the immutable benchmark baseline.
 * @param {string[]} [args] Command arguments.
 * @returns {Promise<Record<string, any>>} Benchmark report.
 */
export async function runBenchmarks(args = process.argv.slice(2)) {
    const recordPath = flagValue(args, '--record')
    if (args.includes('--record') && !recordPath) {
        throw new Error(
            '--record requires a repository-relative path inside the repository.'
        )
    }
    const pkg = JSON.parse(
        await readFile(new URL('package.json', repositoryRoot), 'utf8')
    )
    const identity = {
        packageVersion: pkg.version,
        gitRef: BASE_GIT_REF,
        sourceTree: await git(['rev-parse', `${BASE_GIT_REF}^{tree}`])
    }
    const outputPath = recordPath ? resolveRecordPath(recordPath) : ''
    if (outputPath) {
        const existing = await readExisting(outputPath)
        if (existing) {
            validateExistingReport(existing, identity)
            return existing
        }
    }
    const head = await git(['rev-parse', 'HEAD'])
    if (head !== BASE_GIT_REF) {
        throw new Error(
            `Benchmark recording requires ${BASE_GIT_REF}; found ${head}.`
        )
    }

    const body = await KicadConvergenceBenchmark.run(identity)
    const report = { ...body, reportChecksum: reportChecksum(body) }
    validateExistingReport(report, identity)
    if (outputPath) {
        await mkdir(dirname(outputPath), { recursive: true })
        await writeFile(outputPath, JSON.stringify(report, null, 4) + '\n', {
            flag: 'wx'
        })
    }
    return report
}

/**
 * Returns whether this module is directly executed.
 * @returns {boolean} Whether the module is the entry script.
 */
function isMain() {
    return Boolean(
        process.argv[1] &&
        pathToFileURL(process.argv[1]).href === import.meta.url
    )
}

if (isMain()) {
    const report = await runBenchmarks()
    process.stdout.write(JSON.stringify(report, null, 4) + '\n')
}
