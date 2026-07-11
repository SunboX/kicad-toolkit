// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

const APPROVED_REPORT_CHECKSUM =
    'ccfcc289690126515fb10c021bdf19eff19fd121dc60547c71845201f6418bd2'

const CASES = Object.freeze({
    'parse.large-board': Object.freeze({
        medianMilliseconds: 45.939,
        maximumSampleMilliseconds: 47.094291,
        cloneBytes: 1933822,
        result: Object.freeze({
            elementCount: 1829,
            componentCount: 96,
            drawingCount: 480
        })
    }),
    'parse.all-reports': Object.freeze({
        medianMilliseconds: 29.171041,
        maximumSampleMilliseconds: 30.340292,
        cloneBytes: 1219597,
        result: Object.freeze({
            elementCount: 0,
            componentCount: 96,
            drawingCount: 480
        })
    }),
    'project.multi-entry': Object.freeze({
        medianMilliseconds: 27.193333,
        maximumSampleMilliseconds: 30.203541,
        cloneBytes: 1467605,
        result: Object.freeze({
            documentCount: 2,
            rendererDocumentCount: 2,
            assetCount: 1,
            diagnosticCount: 0
        })
    }),
    'render.multi-layer': Object.freeze({
        medianMilliseconds: 6.92325,
        maximumSampleMilliseconds: 7.87425,
        cloneBytes: 361508,
        result: Object.freeze({ layerCount: 4, svgBytes: 361194 })
    }),
    'query.interaction.repeated': Object.freeze({
        medianMilliseconds: 12.517584,
        maximumSampleMilliseconds: 16.883458,
        cloneBytes: 82851,
        result: Object.freeze({
            queryCount: 8,
            hitBatchCount: 8,
            hitCount: 6
        })
    }),
    'worker.clone': Object.freeze({
        medianMilliseconds: 7.405917,
        maximumSampleMilliseconds: 7.446208,
        cloneBytes: 1916376,
        result: Object.freeze({
            elementCount: 1829,
            componentCount: 96,
            drawingCount: 480
        })
    })
})

/**
 * Holds independent immutable anchors for historical and current benchmarks.
 */
export class KicadApprovedBenchmark {
    /**
     * Authenticates the entire historical benchmark artifact.
     * @param {Record<string, any>} report Historical report.
     * @returns {void}
     */
    static assertHistorical(report) {
        const checksum = createHash('sha256')
            .update(JSON.stringify(report))
            .digest('hex')
        if (checksum !== APPROVED_REPORT_CHECKSUM) {
            throw new Error('Historical report is not the approved benchmark.')
        }
    }

    /**
     * Returns the independently anchored deterministic result for one case.
     * @param {string} id Case id.
     * @returns {Record<string, any>} Expected result.
     */
    static expectedResult(id) {
        const row = CASES[id]
        if (!row) throw new Error(`Unknown approved benchmark case: ${id}`)
        return structuredClone(row.result)
    }

    /**
     * Validates deterministic result content and safe measurement bounds.
     * @param {Record<string, any>} row Case measurement.
     * @returns {void}
     */
    static assertCase(row) {
        const approved = CASES[row.id]
        if (!approved || !isDeepStrictEqual(row.result, approved.result)) {
            throw new Error(`Unexpected benchmark result for ${row.id}`)
        }
        const samples = Array.isArray(row.samples) ? row.samples : []
        const heap = row.retainedHeap || {}
        const valid =
            samples.length > 0 &&
            samples.every(
                (sample) =>
                    Number.isFinite(sample) &&
                    sample > 0 &&
                    sample <= approved.maximumSampleMilliseconds * 20
            ) &&
            Number.isFinite(row.medianMilliseconds) &&
            row.medianMilliseconds > 0 &&
            row.medianMilliseconds <= approved.medianMilliseconds * 10 &&
            Number.isInteger(row.cloneBytes) &&
            row.cloneBytes >= Math.floor(approved.cloneBytes * 0.25) &&
            row.cloneBytes <= Math.ceil(approved.cloneBytes * 4) &&
            heap.gcControlled === true &&
            Number.isInteger(heap.beforeBytes) &&
            heap.beforeBytes > 0 &&
            Number.isInteger(heap.afterBytes) &&
            heap.afterBytes > 0 &&
            Number.isInteger(heap.retainedBytes) &&
            heap.retainedBytes >= 0 &&
            heap.retainedBytes ===
                Math.max(0, heap.afterBytes - heap.beforeBytes)
        if (!valid) {
            throw new Error(`Unsafe benchmark measurement for ${row.id}`)
        }
    }

    /**
     * Returns the maximum permitted candidate-to-baseline median ratio.
     * @param {string} id Case id.
     * @param {boolean} primary Whether the case is a release primary.
     * @returns {number} Maximum ratio.
     */
    static maximumRegressionRatio(id, primary) {
        if (!CASES[id])
            throw new Error(`Unknown approved benchmark case: ${id}`)
        return primary ? 1.25 : 1.5
    }
}

Object.freeze(KicadApprovedBenchmark.prototype)
Object.freeze(KicadApprovedBenchmark)
