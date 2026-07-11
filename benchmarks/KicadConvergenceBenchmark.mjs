// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from 'node:crypto'
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { serialize } from 'node:v8'

import { KicadProjectLoader, KicadParser } from '../src/legacy-parser.mjs'
import { QueryNetlistBuilder } from '../src/legacy-netlist-query.mjs'
import {
    PcbInteractionIndex,
    PcbSvgRenderer
} from '../src/legacy-renderers.mjs'
import { KicadBenchmarkFixtureFactory } from './KicadBenchmarkFixtureFactory.mjs'

const CASES = Object.freeze([
    Object.freeze({
        id: 'parse.large-board',
        primary: true,
        warmups: 1,
        samples: 3,
        workload: 'Parse and project one large synthetic KiCad PCB.'
    }),
    Object.freeze({
        id: 'parse.all-reports',
        primary: false,
        warmups: 1,
        samples: 3,
        workload: 'Parse the native board model and all eager 1.0.29 reports.'
    }),
    Object.freeze({
        id: 'project.multi-entry',
        primary: false,
        warmups: 1,
        samples: 3,
        workload:
            'Load a deterministic multi-board project and companion asset.'
    }),
    Object.freeze({
        id: 'render.multi-layer',
        primary: true,
        warmups: 1,
        samples: 3,
        workload: 'Render all deterministic PCB layer SVGs.'
    }),
    Object.freeze({
        id: 'query.interaction.repeated',
        primary: false,
        warmups: 1,
        samples: 3,
        workload:
            'Repeat query-netlist construction and interaction hit testing.'
    }),
    Object.freeze({
        id: 'worker.clone',
        primary: true,
        warmups: 1,
        samples: 3,
        workload: 'Structured-clone the current hybrid parser result.'
    })
])

/**
 * Runs the deterministic convergence benchmark cases.
 */
export class KicadConvergenceBenchmark {
    /**
     * Returns the immutable case contract without executing workloads.
     * @returns {ReadonlyArray<Record<string, any>>} Case definitions.
     */
    static cases() {
        return CASES
    }

    /**
     * Runs every benchmark case and returns a complete baseline report body.
     * @param {{ packageVersion: string, gitRef: string, sourceTree: string }} identity Baseline identity.
     * @returns {Promise<Record<string, any>>} Benchmark report body.
     */
    static async run(identity) {
        const fixture = KicadBenchmarkFixtureFactory.manifest()
        const context = KicadConvergenceBenchmark.#prepareContext()
        const cases = []
        for (const definition of CASES) {
            cases.push(
                await KicadConvergenceBenchmark.#measure(definition, context)
            )
        }
        return {
            schema: 'kicad-toolkit.benchmark.v1',
            package: 'kicad-toolkit',
            packageVersion: identity.packageVersion,
            gitRef: identity.gitRef,
            sourceTree: identity.sourceTree,
            fixture,
            fixtureChecksum: fixture.checksum,
            caseContractChecksum: createHash('sha256')
                .update(JSON.stringify(CASES))
                .digest('hex'),
            environment: {
                platform: process.platform,
                architecture: process.arch,
                node: process.version,
                cpu: cpus()[0]?.model || 'unknown',
                logicalCpuCount: cpus().length
            },
            cases
        }
    }

    /**
     * Creates shared immutable workload inputs outside measured samples.
     * @returns {Record<string, any>} Prepared benchmark context.
     */
    static #prepareContext() {
        const bytes = KicadBenchmarkFixtureFactory.largeBoardBytes()
        const parsed = KicadParser.parseArrayBuffer(
            'synthetic-large.kicad_pcb',
            bytes
        )
        const renderer = KicadParser.parseArrayBufferToRendererModel(
            'synthetic-large.kicad_pcb',
            bytes
        )
        return { bytes, parsed, renderer }
    }

    /**
     * Measures one benchmark definition.
     * @param {Record<string, any>} definition Case definition.
     * @param {Record<string, any>} context Prepared context.
     * @returns {Promise<Record<string, any>>} Case measurement.
     */
    static async #measure(definition, context) {
        for (let index = 0; index < definition.warmups; index += 1) {
            await KicadConvergenceBenchmark.#operation(definition.id, context)
        }
        globalThis.gc?.()
        const beforeBytes = process.memoryUsage().heapUsed
        const samples = []
        let finalResult
        for (let index = 0; index < definition.samples; index += 1) {
            const started = performance.now()
            finalResult = await KicadConvergenceBenchmark.#operation(
                definition.id,
                context
            )
            samples.push(Number((performance.now() - started).toFixed(6)))
        }
        const summary = KicadConvergenceBenchmark.#summary(
            definition.id,
            finalResult
        )
        const cloneBytes = serialize(finalResult).byteLength
        finalResult = null
        globalThis.gc?.()
        const afterBytes = process.memoryUsage().heapUsed
        return {
            id: definition.id,
            primary: definition.primary,
            workload: definition.workload,
            warmups: definition.warmups,
            sampleCount: definition.samples,
            samples,
            medianMilliseconds: KicadConvergenceBenchmark.#median(samples),
            result: summary,
            resultChecksum: createHash('sha256')
                .update(JSON.stringify(summary))
                .digest('hex'),
            cloneBytes,
            retainedHeap: {
                gcControlled: typeof globalThis.gc === 'function',
                beforeBytes,
                afterBytes,
                retainedBytes: Math.max(0, afterBytes - beforeBytes)
            }
        }
    }

    /**
     * Executes one named benchmark workload.
     * @param {string} id Case id.
     * @param {Record<string, any>} context Prepared context.
     * @returns {Promise<unknown>} Workload result.
     */
    static async #operation(id, context) {
        if (id === 'parse.large-board') {
            return KicadParser.parseArrayBuffer(
                'synthetic-large.kicad_pcb',
                context.bytes
            )
        }
        if (id === 'parse.all-reports') {
            return KicadParser.parseArrayBufferToRendererModel(
                'synthetic-large.kicad_pcb',
                context.bytes
            )
        }
        if (id === 'project.multi-entry') {
            return KicadProjectLoader.loadEntries(
                KicadBenchmarkFixtureFactory.projectEntries()
            )
        }
        if (id === 'render.multi-layer') {
            return PcbSvgRenderer.renderLayerSvgs(context.renderer)
        }
        if (id === 'query.interaction.repeated') {
            const netlists = []
            const hits = []
            for (let index = 0; index < 8; index += 1) {
                netlists.push(QueryNetlistBuilder.build(context.parsed))
                const items = PcbInteractionIndex.build(context.renderer)
                hits.push(
                    PcbInteractionIndex.hitTestItems(items, {
                        x: 8 + index,
                        y: 12 + index
                    })
                )
            }
            return { netlists, hits }
        }
        if (id === 'worker.clone') return structuredClone(context.parsed)
        throw new Error(`Unknown benchmark case: ${id}`)
    }

    /**
     * Builds a deterministic compact result summary.
     * @param {string} id Case id.
     * @param {unknown} result Workload result.
     * @returns {Record<string, any>} Result summary.
     */
    static #summary(id, result) {
        if (id === 'render.multi-layer') {
            const rows = Array.isArray(result) ? result : []
            return {
                layerCount: rows.length,
                svgBytes: rows.reduce(
                    (total, row) => total + Buffer.byteLength(row.svg || ''),
                    0
                )
            }
        }
        if (id === 'project.multi-entry') {
            return {
                documentCount: result?.documents?.length || 0,
                rendererDocumentCount: result?.rendererDocuments?.length || 0,
                assetCount: result?.assets?.length || 0,
                diagnosticCount: result?.diagnostics?.length || 0
            }
        }
        if (id === 'query.interaction.repeated') {
            return {
                queryCount: result?.netlists?.length || 0,
                hitBatchCount: result?.hits?.length || 0,
                hitCount: (result?.hits || []).reduce(
                    (total, rows) => total + rows.length,
                    0
                )
            }
        }
        return {
            elementCount: Array.isArray(result) ? result.length : 0,
            componentCount: result?.summary?.componentCount || 0,
            drawingCount: result?.pcb?.kicadBoard?.drawings?.length || 0
        }
    }

    /**
     * Returns the stable median of timing samples.
     * @param {number[]} samples Timing samples.
     * @returns {number} Six-decimal median.
     */
    static #median(samples) {
        const sorted = [...samples].sort((left, right) => left - right)
        const middle = Math.floor(sorted.length / 2)
        return sorted.length % 2 === 1
            ? sorted[middle]
            : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(6))
    }
}
