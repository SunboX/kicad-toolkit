// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual, promisify } from 'node:util'

import { KicadConvergenceBenchmark } from '../benchmarks/KicadConvergenceBenchmark.mjs'
import { KicadCanonicalBenchmark } from '../benchmarks/KicadCanonicalBenchmark.mjs'
import { KicadBenchmarkFixtureFactory } from '../benchmarks/KicadBenchmarkFixtureFactory.mjs'
import { KicadApprovedBenchmark } from './KicadApprovedBenchmark.mjs'

const execFileAsync = promisify(execFile)
const repositoryRoot = new URL('../', import.meta.url)
const BASE_GIT_REF = 'c71c88d69d236accce123656dfa66914c0d5489c'
const BASE_PACKAGE_VERSION = '1.0.29'

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
function validMeasurement(row, definition) {
    const samples = Array.isArray(row.samples) ? row.samples : []
    let approved = true
    try {
        KicadApprovedBenchmark.assertCase(row)
    } catch {
        approved = false
    }
    return (
        Number.isInteger(row.sampleCount) &&
        row.sampleCount === definition.samples &&
        samples.length === row.sampleCount &&
        samples.every((sample) => Number.isFinite(sample) && sample > 0) &&
        row.medianMilliseconds === median(samples) &&
        row.resultChecksum ===
            createHash('sha256')
                .update(JSON.stringify(row.result))
                .digest('hex') &&
        approved
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
    const expectedFixture = KicadBenchmarkFixtureFactory.manifest()
    const expectedCaseContractChecksum = createHash('sha256')
        .update(JSON.stringify(definitions))
        .digest('hex')
    const primary = (report.cases || [])
        .filter((row) => row.primary)
        .map((row) => row.id)
    let approvedArtifact = true
    try {
        KicadApprovedBenchmark.assertHistorical(report)
    } catch {
        approvedArtifact = false
    }
    if (
        report.schema !== 'kicad-toolkit.benchmark.v1' ||
        report.package !== 'kicad-toolkit' ||
        report.packageVersion !== identity.packageVersion ||
        report.gitRef !== identity.gitRef ||
        report.sourceTree !== identity.sourceTree ||
        !isDeepStrictEqual(report.fixture, expectedFixture) ||
        report.fixtureChecksum !== expectedFixture.checksum ||
        report.caseContractChecksum !== expectedCaseContractChecksum ||
        !isDeepStrictEqual(contracts, expectedContracts) ||
        !isDeepStrictEqual(primary, [
            'parse.large-board',
            'render.multi-layer',
            'worker.clone'
        ]) ||
        !(report.cases || []).every((row, index) =>
            validMeasurement(row, definitions[index])
        ) ||
        !approvedArtifact ||
        checksum !== reportChecksum(body)
    ) {
        throw new Error(
            'Existing benchmark baseline differs from the approved benchmark.'
        )
    }
}

/**
 * Validates a freshly measured candidate report against deterministic anchors.
 * @param {Record<string, any>} report Candidate report.
 * @param {{ packageVersion: string, gitRef: string, sourceTree: string }} identity Candidate identity.
 * @returns {void}
 */
export function validateCurrentReport(report, identity) {
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
    if (
        report.schema !== 'kicad-toolkit.benchmark.v1' ||
        report.package !== 'kicad-toolkit' ||
        report.packageVersion !== identity.packageVersion ||
        report.gitRef !== identity.gitRef ||
        report.sourceTree !== identity.sourceTree ||
        !isDeepStrictEqual(
            report.fixture,
            KicadBenchmarkFixtureFactory.manifest()
        ) ||
        report.fixtureChecksum !== report.fixture.checksum ||
        report.caseContractChecksum !==
            createHash('sha256')
                .update(JSON.stringify(definitions))
                .digest('hex') ||
        !isDeepStrictEqual(contracts, expectedContracts) ||
        !(report.cases || []).every((row, index) =>
            validMeasurement(row, definitions[index])
        ) ||
        checksum !== reportChecksum(body)
    ) {
        throw new Error('Current benchmark differs from the approved contract.')
    }
}

/**
 * Compares freshly measured current timings with the approved baseline.
 * @param {Record<string, any>} current Current report.
 * @param {Record<string, any>} baseline Historical baseline.
 * @returns {{ passed: boolean, cases: Record<string, any>[] }} Comparison.
 */
export function compareBenchmarkReports(current, baseline) {
    KicadApprovedBenchmark.assertHistorical(baseline)
    validateCurrentReport(current, {
        packageVersion: current.packageVersion,
        gitRef: current.gitRef,
        sourceTree: current.sourceTree
    })
    if (
        current.gitRef === baseline.gitRef ||
        current.sourceTree === baseline.sourceTree
    ) {
        throw new Error('Current benchmark must identify the candidate HEAD.')
    }
    const baselineById = new Map(
        (baseline.cases || []).map((row) => [row.id, row])
    )
    const reusedMeasurements = (current.cases || []).every((row) => {
        const approved = baselineById.get(row.id)
        return (
            approved &&
            isDeepStrictEqual(row.samples, approved.samples) &&
            row.medianMilliseconds === approved.medianMilliseconds &&
            row.cloneBytes === approved.cloneBytes &&
            isDeepStrictEqual(row.retainedHeap, approved.retainedHeap)
        )
    })
    if (reusedMeasurements) {
        throw new Error('Current benchmark reuses historical measurements.')
    }
    const cases = (current.cases || []).map((row) => {
        KicadApprovedBenchmark.assertCase(row)
        const approved = baselineById.get(row.id)
        if (!approved) throw new Error(`Missing baseline case: ${row.id}`)
        const ratio = Number(
            (row.medianMilliseconds / approved.medianMilliseconds).toFixed(6)
        )
        const maximumRatio = KicadApprovedBenchmark.maximumRegressionRatio(
            row.id,
            row.primary
        )
        return {
            id: row.id,
            primary: row.primary,
            baselineMedianMilliseconds: approved.medianMilliseconds,
            currentMedianMilliseconds: row.medianMilliseconds,
            ratio,
            maximumRatio,
            passed: ratio <= maximumRatio
        }
    })
    return { passed: cases.every((row) => row.passed), cases }
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
    const baselineIdentity = {
        packageVersion: BASE_PACKAGE_VERSION,
        gitRef: BASE_GIT_REF,
        sourceTree: await git(['rev-parse', `${BASE_GIT_REF}^{tree}`])
    }
    const outputPath = recordPath ? resolveRecordPath(recordPath) : ''
    if (outputPath) {
        const existing = await readExisting(outputPath)
        if (existing) {
            validateExistingReport(existing, baselineIdentity)
            return existing
        }
        const head = await git(['rev-parse', 'HEAD'])
        if (head !== BASE_GIT_REF) {
            throw new Error(
                `Benchmark recording requires ${BASE_GIT_REF}; found ${head}.`
            )
        }
        const body = await KicadConvergenceBenchmark.run(baselineIdentity)
        const report = { ...body, reportChecksum: reportChecksum(body) }
        validateExistingReport(report, baselineIdentity)
        await mkdir(dirname(outputPath), { recursive: true })
        await writeFile(outputPath, JSON.stringify(report, null, 4) + '\n', {
            flag: 'wx'
        })
        return report
    }

    const baselinePath = resolve(
        fileURLToPath(repositoryRoot),
        'benchmarks/baseline-v1.0.29.json'
    )
    const baseline = await readExisting(baselinePath)
    if (!baseline) throw new Error('Approved benchmark baseline is missing.')
    validateExistingReport(baseline, baselineIdentity)
    const head = await git(['rev-parse', 'HEAD'])
    const currentIdentity = {
        packageVersion: pkg.version,
        gitRef: head,
        sourceTree: await git(['rev-parse', `${head}^{tree}`])
    }
    const body = await KicadConvergenceBenchmark.run(currentIdentity)
    const current = { ...body, reportChecksum: reportChecksum(body) }
    validateCurrentReport(current, currentIdentity)
    const comparison = compareBenchmarkReports(current, baseline)
    if (!comparison.passed) {
        const failed = comparison.cases
            .filter((row) => !row.passed)
            .map((row) => row.id)
            .join(', ')
        throw new Error(`Benchmark regression gate failed: ${failed}`)
    }
    const canonical = await KicadCanonicalBenchmark.run()
    if (!canonical.passed) {
        const failed = canonical.cases
            .filter((row) => !row.passed)
            .map((row) => row.id)
            .join(', ')
        throw new Error(`Canonical benchmark ceiling failed: ${failed}`)
    }
    return {
        schema: 'kicad-toolkit.benchmark-comparison.v1',
        baseline,
        current,
        comparison,
        canonical
    }
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
