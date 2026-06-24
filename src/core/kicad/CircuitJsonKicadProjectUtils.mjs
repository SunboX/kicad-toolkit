// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { SExpressionSerializer } from './SExpressionSerializer.mjs'

const LENGTH_FACTORS_TO_MM = new Map([
    ['mm', 1],
    ['cm', 10],
    ['m', 1000],
    ['in', 25.4],
    ['inch', 25.4],
    ['mil', 0.0254],
    ['mils', 0.0254],
    ['um', 0.001]
])

/**
 * Shared helpers for CircuitJSON-to-KiCad project export.
 */
export class CircuitJsonKicadProjectUtils {
    /**
     * Creates one S-expression text entry.
     * @param {string} path Archive path.
     * @param {Array} node S-expression root.
     * @param {string} contentType Content type.
     * @returns {{ path: string, bytes: Uint8Array, contentType: string }}
     */
    static sexprEntry(path, node, contentType) {
        return CircuitJsonKicadProjectUtils.textEntry(
            path,
            SExpressionSerializer.serializeDocument(node),
            contentType
        )
    }

    /**
     * Creates one JSON text entry.
     * @param {string} path Archive path.
     * @param {unknown} value JSON value.
     * @returns {{ path: string, bytes: Uint8Array, contentType: string }}
     */
    static jsonEntry(path, value) {
        return CircuitJsonKicadProjectUtils.textEntry(
            path,
            JSON.stringify(value, null, 2) + '\n',
            'application/json'
        )
    }

    /**
     * Creates one UTF-8 text entry.
     * @param {string} path Archive path.
     * @param {string} text Entry text.
     * @param {string} contentType Content type.
     * @returns {{ path: string, bytes: Uint8Array, contentType: string }}
     */
    static textEntry(path, text, contentType) {
        return {
            path,
            bytes: new TextEncoder().encode(text),
            contentType
        }
    }

    /**
     * Reads a point from an element.
     * @param {object} element Candidate element.
     * @returns {{ x: number, y: number } | null}
     */
    static point(element) {
        if (element?.center)
            return CircuitJsonKicadProjectUtils.point(element.center)
        const x = CircuitJsonKicadProjectUtils.number(element?.x, NaN)
        const y = CircuitJsonKicadProjectUtils.number(element?.y, NaN)
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null
        return {
            x: CircuitJsonKicadProjectUtils.round(x),
            y: CircuitJsonKicadProjectUtils.round(y)
        }
    }

    /**
     * Resolves board bounds.
     * @param {object | null} board Board element.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
     */
    static boardBounds(board) {
        if (!board) return null
        const center = CircuitJsonKicadProjectUtils.point(board) || {
            x: 0,
            y: 0
        }
        const width = CircuitJsonKicadProjectUtils.number(board.width, NaN)
        const height = CircuitJsonKicadProjectUtils.number(board.height, NaN)
        if (!Number.isFinite(width) || !Number.isFinite(height)) return null

        return {
            minX: CircuitJsonKicadProjectUtils.round(center.x - width / 2),
            minY: CircuitJsonKicadProjectUtils.round(center.y - height / 2),
            maxX: CircuitJsonKicadProjectUtils.round(center.x + width / 2),
            maxY: CircuitJsonKicadProjectUtils.round(center.y + height / 2)
        }
    }

    /**
     * Resolves a text value.
     * @param {unknown} value Candidate value.
     * @param {unknown} [fallback] Fallback value.
     * @returns {string}
     */
    static text(value, fallback = '') {
        if (value === undefined || value === null || value === '') {
            return String(fallback || '')
        }
        return String(value)
    }

    /**
     * Reads a finite number.
     * @param {unknown} value Candidate number.
     * @param {number} fallback Fallback number.
     * @returns {number}
     */
    static number(value, fallback) {
        const parsed = CircuitJsonKicadProjectUtils.#parseNumber(value)
        return Number.isFinite(parsed)
            ? CircuitJsonKicadProjectUtils.round(parsed)
            : fallback
    }

    /**
     * Rounds generated numeric output.
     * @param {number} value Candidate number.
     * @returns {number}
     */
    static round(value) {
        const rounded = Number(Number(value || 0).toFixed(6))
        return Object.is(rounded, -0) ? 0 : rounded
    }

    /**
     * Creates a KiCad-safe item name.
     * @param {unknown} value Source value.
     * @returns {string}
     */
    static safeName(value) {
        const name = CircuitJsonKicadProjectUtils.text(
            value,
            'Generated_Project'
        )
            .trim()
            .replace(/[\\/:\u0000-\u001f]/gu, '_')
            .replace(/\s+/gu, '_')
        return name || 'Generated_Project'
    }

    /**
     * Creates a file-name-safe token.
     * @param {unknown} value Source value.
     * @returns {string}
     */
    static safeFileName(value) {
        const fileName = CircuitJsonKicadProjectUtils.baseName(value)
            .replace(/[\\/:\u0000-\u001f]/gu, '_')
            .replace(/\s+/gu, '_')
        return fileName || 'model.step'
    }

    /**
     * Returns a basename from a path-like value.
     * @param {unknown} value Path-like value.
     * @returns {string}
     */
    static baseName(value) {
        return (
            String(value || '')
                .split('?')[0]
                .split('#')[0]
                .replace(/\\/gu, '/')
                .split('/')
                .filter(Boolean)
                .at(-1) || ''
        )
    }

    /**
     * Returns a lowercase extension without dot.
     * @param {unknown} value File name.
     * @returns {string}
     */
    static extension(value) {
        const name = CircuitJsonKicadProjectUtils.baseName(value)
        const extension = name.includes('.') ? name.split('.').at(-1) : ''
        return String(extension || '').toLowerCase()
    }

    /**
     * Converts a value into bytes.
     * @param {unknown} value Candidate binary value.
     * @returns {Uint8Array}
     */
    static bytes(value) {
        if (value instanceof Uint8Array) return new Uint8Array(value)
        if (value instanceof ArrayBuffer) return new Uint8Array(value)
        if (ArrayBuffer.isView(value)) {
            return new Uint8Array(
                value.buffer,
                value.byteOffset,
                value.byteLength
            )
        }
        if (typeof value === 'string') return new TextEncoder().encode(value)
        return new Uint8Array(0)
    }

    /**
     * Normalizes an archive base path.
     * @param {unknown} value Base path.
     * @returns {string}
     */
    static normalizeBasePath(value) {
        return String(value || '')
            .replace(/\\/gu, '/')
            .replace(/^\/+|\/+$/gu, '')
    }

    /**
     * Joins archive path segments.
     * @param {string} basePath Base path.
     * @param {string} relativePath Relative path.
     * @returns {string}
     */
    static joinPath(basePath, relativePath) {
        return [basePath, relativePath].filter(Boolean).join('/')
    }

    /**
     * Creates one deterministic UUID from a seed.
     * @param {string} seed UUID seed.
     * @returns {string}
     */
    static uuid(seed) {
        const hex = CircuitJsonKicadProjectUtils.hashHex(seed, 32)
        return (
            hex.slice(0, 8) +
            '-' +
            hex.slice(8, 12) +
            '-4' +
            hex.slice(13, 16) +
            '-8' +
            hex.slice(17, 20) +
            '-' +
            hex.slice(20, 32)
        )
    }

    /**
     * Builds deterministic hexadecimal hash text.
     * @param {string} seed Hash seed.
     * @param {number} length Desired hex length.
     * @returns {string}
     */
    static hashHex(seed, length) {
        let output = ''
        let salt = 0

        while (output.length < length) {
            let hash = 0x811c9dc5
            const text = String(seed) + ':' + salt
            for (let index = 0; index < text.length; index += 1) {
                hash ^= text.charCodeAt(index)
                hash = Math.imul(hash, 0x01000193) >>> 0
            }
            output += hash.toString(16).padStart(8, '0')
            salt += 1
        }

        return output.slice(0, length)
    }

    /**
     * Parses a numeric value with an optional supported unit suffix.
     * @param {unknown} value Candidate value.
     * @returns {number}
     */
    static #parseNumber(value) {
        if (typeof value === 'number') return value
        const text = String(value ?? '').trim()
        if (!text) return NaN
        const match = text.match(
            /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([a-z]+)?$/iu
        )
        if (!match) return NaN
        const number = Number(match[1])
        if (!Number.isFinite(number)) return NaN
        const unit = String(match[2] || '').toLowerCase()
        const factor = unit ? LENGTH_FACTORS_TO_MM.get(unit) : 1
        return Number.isFinite(factor) ? number * factor : NaN
    }
}
