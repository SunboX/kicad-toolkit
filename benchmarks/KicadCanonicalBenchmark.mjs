// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { performance } from 'node:perf_hooks'

import { Parser } from '../src/parser.mjs'
import { ProjectLoader } from '../src/project.mjs'
import { KicadBenchmarkFixtureFactory } from './KicadBenchmarkFixtureFactory.mjs'

const CASES = Object.freeze([
    Object.freeze({
        id: 'canonical.parse.large-board',
        warmups: 1,
        samples: 5,
        maximumMedianMilliseconds: 500,
        workload: 'Parse one large KiCad board into a canonical document.'
    }),
    Object.freeze({
        id: 'canonical.project.multi-entry',
        warmups: 1,
        samples: 5,
        maximumMedianMilliseconds: 750,
        workload: 'Load two KiCad boards and companions as one project.'
    })
])

/** Measures the source-neutral KiCad convergence path. */
export class KicadCanonicalBenchmark {
    /** @returns {ReadonlyArray<Record<string, any>>} Immutable case definitions. */
    static cases() {
        return CASES
    }

    /** @returns {Promise<Record<string, any>>} Absolute-gate report. */
    static async run() {
        const inputs = KicadCanonicalBenchmark.#inputs()
        const cases = []
        for (const definition of CASES) {
            cases.push(
                await KicadCanonicalBenchmark.#measure(definition, inputs)
            )
        }
        return {
            schema: 'kicad-toolkit.canonical-benchmark.v1',
            fixtureChecksum: KicadBenchmarkFixtureFactory.manifest().checksum,
            passed: cases.every((row) => row.passed),
            cases
        }
    }

    /** @returns {Record<string, any>} Prepared immutable benchmark inputs. */
    static #inputs() {
        return {
            parser: {
                fileName: 'synthetic-large.kicad_pcb',
                data: KicadBenchmarkFixtureFactory.largeBoardBytes()
            },
            project: KicadBenchmarkFixtureFactory.projectEntries().map(
                (entry) => ({ name: entry.name, data: entry.bytes })
            )
        }
    }

    /** @param {Record<string, any>} definition Case. @param {Record<string, any>} inputs Inputs. @returns {Promise<Record<string, any>>} Measurement. */
    static async #measure(definition, inputs) {
        for (let index = 0; index < definition.warmups; index += 1) {
            KicadCanonicalBenchmark.#operation(definition.id, inputs)
        }
        const samples = []
        let result
        for (let index = 0; index < definition.samples; index += 1) {
            const started = performance.now()
            result = KicadCanonicalBenchmark.#operation(definition.id, inputs)
            samples.push(Number((performance.now() - started).toFixed(6)))
        }
        const medianMilliseconds = KicadCanonicalBenchmark.#median(samples)
        return {
            ...definition,
            sampleCount: definition.samples,
            samples,
            medianMilliseconds,
            result: KicadCanonicalBenchmark.#summary(definition.id, result),
            passed: medianMilliseconds <= definition.maximumMedianMilliseconds
        }
    }

    /** @param {string} id Case id. @param {Record<string, any>} inputs Inputs. @returns {Record<string, any>} Result. */
    static #operation(id, inputs) {
        if (id === 'canonical.parse.large-board') {
            return Parser.parse(inputs.parser)
        }
        if (id === 'canonical.project.multi-entry') {
            return ProjectLoader.load(inputs.project)
        }
        throw new Error(`Unknown canonical benchmark case: ${id}`)
    }

    /** @param {string} id Case id. @param {Record<string, any>} result Result. @returns {Record<string, number>} Summary. */
    static #summary(id, result) {
        if (id === 'canonical.parse.large-board') {
            return {
                documentCount: 1,
                elementCount: result?.model?.length || 0,
                diagnosticCount: result?.diagnostics?.length || 0
            }
        }
        return {
            documentCount: result?.documents?.length || 0,
            assetCount: result?.assets?.length || 0,
            diagnosticCount: result?.diagnostics?.length || 0
        }
    }

    /** @param {number[]} samples Samples. @returns {number} Median. */
    static #median(samples) {
        const sorted = [...samples].sort((left, right) => left - right)
        const middle = Math.floor(sorted.length / 2)
        return sorted.length % 2 === 1
            ? sorted[middle]
            : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(6))
    }
}

Object.freeze(KicadCanonicalBenchmark.prototype)
Object.freeze(KicadCanonicalBenchmark)
