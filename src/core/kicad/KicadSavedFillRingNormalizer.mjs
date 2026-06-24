const coordinateEpsilon = 1e-12
const areaEpsilon = 1e-18

/**
 * Normalizes saved PCB fill rings for readiness checks.
 */
export class KicadSavedFillRingNormalizer {
    /**
     * Inspects one candidate ring and returns dropped-ring diagnostics.
     * @param {unknown[]} points Candidate point rows.
     * @param {{ role?: string, shapeIndex?: number, ringIndex?: number }} options Inspection options.
     * @returns {{ loop: object[], diagnostic: object | null, area: number }}
     */
    static inspect(points, options = {}) {
        const rows = KicadSavedFillRingNormalizer.#pointRows(points)
        if (rows.some((row) => !row.isFinite)) {
            return KicadSavedFillRingNormalizer.#result(
                [],
                'non-finite-point',
                options,
                rows.length,
                0
            )
        }

        const loop = KicadSavedFillRingNormalizer.#cleanLoop(rows)
        const area = Math.abs(KicadSavedFillRingNormalizer.signedArea(loop))
        if (loop.length < 3) {
            return KicadSavedFillRingNormalizer.#result(
                loop,
                'too-few-points',
                options,
                loop.length,
                area
            )
        }
        if (area <= areaEpsilon) {
            return KicadSavedFillRingNormalizer.#result(
                loop,
                'near-zero-area',
                options,
                loop.length,
                area
            )
        }

        return { loop, diagnostic: null, area }
    }

    /**
     * Computes signed polygon area.
     * @param {object[]} loop Candidate loop.
     * @returns {number}
     */
    static signedArea(loop) {
        let area = 0
        for (let index = 0; index < (loop || []).length; index += 1) {
            const current = loop[index]
            const next = loop[(index + 1) % loop.length]
            area += Number(current.x) * Number(next.y)
            area -= Number(next.x) * Number(current.y)
        }
        return area / 2
    }

    /**
     * Normalizes candidate point rows into numeric values.
     * @param {unknown[]} points Candidate point rows.
     * @returns {{ x: number, y: number, isFinite: boolean }[]}
     */
    static #pointRows(points) {
        return (Array.isArray(points) ? points : []).map((point) => {
            const x = Number(Array.isArray(point) ? point[0] : point?.x)
            const y = Number(Array.isArray(point) ? point[1] : point?.y)
            return {
                x,
                y,
                isFinite: Number.isFinite(x) && Number.isFinite(y)
            }
        })
    }

    /**
     * Removes consecutive duplicate and closing points.
     * @param {{ x: number, y: number }[]} points Candidate points.
     * @returns {object[]}
     */
    static #cleanLoop(points) {
        const loop = []
        for (const point of points || []) {
            const previous = loop.at(-1)
            if (
                previous &&
                Math.abs(previous.x - point.x) < coordinateEpsilon &&
                Math.abs(previous.y - point.y) < coordinateEpsilon
            ) {
                continue
            }
            loop.push({ x: point.x, y: point.y })
        }

        const first = loop[0]
        const last = loop.at(-1)
        if (
            first &&
            last &&
            Math.abs(first.x - last.x) < coordinateEpsilon &&
            Math.abs(first.y - last.y) < coordinateEpsilon
        ) {
            loop.pop()
        }

        return loop
    }

    /**
     * Builds an inspection result with one diagnostic.
     * @param {object[]} loop Cleaned loop.
     * @param {string} reason Drop reason.
     * @param {{ role?: string, shapeIndex?: number, ringIndex?: number }} options Inspection options.
     * @param {number} pointCount Clean point count.
     * @param {number} area Absolute loop area.
     * @returns {{ loop: object[], diagnostic: object, area: number }}
     */
    static #result(loop, reason, options, pointCount, area) {
        return {
            loop,
            diagnostic: KicadSavedFillRingNormalizer.#diagnostic(
                reason,
                options,
                pointCount,
                area
            ),
            area
        }
    }

    /**
     * Builds one dropped-ring diagnostic row.
     * @param {string} reason Drop reason.
     * @param {{ role?: string, shapeIndex?: number, ringIndex?: number }} options Inspection options.
     * @param {number} pointCount Clean point count.
     * @param {number} area Absolute loop area.
     * @returns {object}
     */
    static #diagnostic(reason, options, pointCount, area) {
        const diagnostic = {
            reason,
            role: String(options.role || 'ring'),
            pointCount,
            area
        }
        if (Number.isInteger(options.shapeIndex)) {
            diagnostic.shapeIndex = options.shapeIndex
        }
        if (Number.isInteger(options.ringIndex)) {
            diagnostic.ringIndex = options.ringIndex
        }
        return diagnostic
    }
}
