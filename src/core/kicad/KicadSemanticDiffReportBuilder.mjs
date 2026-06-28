// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { SExpressionParser } from './SExpressionParser.mjs'

const SCHEMA_ID = 'kicad-toolkit.semantic-diff.a1'
const textDecoder = new TextDecoder()
const placeholderAtoms = new Set([
    '__GENERATOR__',
    '__GENERATOR_VERSION__',
    '__SHEET_ID__',
    '__TIMESTAMP__',
    '__TSTAMP__',
    '__UUID__',
    '__VERSION__'
])
const volatileSExpressionFields = new Map([
    ['generator', '__GENERATOR__'],
    ['generator_version', '__GENERATOR_VERSION__'],
    ['tstamp', '__TSTAMP__'],
    ['uuid', '__UUID__'],
    ['version', '__VERSION__']
])
const volatileJsonKeys = new Map([
    ['created', '__TIMESTAMP__'],
    ['date', '__TIMESTAMP__'],
    ['generator', '__GENERATOR__'],
    ['generator_version', '__GENERATOR_VERSION__'],
    ['last_modified', '__TIMESTAMP__'],
    ['modified', '__TIMESTAMP__'],
    ['uuid', '__UUID__']
])

/**
 * Builds semantic diff reports for KiCad source entries.
 */
export class KicadSemanticDiffReportBuilder {
    /**
     * Compares two collections of source entries after format-aware
     * normalization.
     * @param {{ leftEntries?: object[], rightEntries?: object[], leftLabel?: string, rightLabel?: string }} [options] Diff options.
     * @returns {object}
     */
    static build(options = {}) {
        const diagnostics = []
        const leftLabel = KicadSemanticDiffReportBuilder.#label(
            options.leftLabel,
            'left'
        )
        const rightLabel = KicadSemanticDiffReportBuilder.#label(
            options.rightLabel,
            'right'
        )
        const leftEntries = KicadSemanticDiffReportBuilder.#entryMap(
            options.leftEntries,
            diagnostics,
            leftLabel
        )
        const rightEntries = KicadSemanticDiffReportBuilder.#entryMap(
            options.rightEntries,
            diagnostics,
            rightLabel
        )
        const paths = Array.from(
            new Set([...leftEntries.keys(), ...rightEntries.keys()])
        ).sort((left, right) => left.localeCompare(right))
        const entries = paths.map((path) =>
            KicadSemanticDiffReportBuilder.#entryDiff({
                path,
                leftEntry: leftEntries.get(path),
                rightEntry: rightEntries.get(path),
                leftLabel,
                rightLabel,
                diagnostics
            })
        )
        const summary = KicadSemanticDiffReportBuilder.#summary(
            entries,
            diagnostics
        )

        return {
            schema: SCHEMA_ID,
            pass:
                summary.differenceCount === 0 && summary.diagnosticCount === 0,
            summary,
            entries,
            diagnostics
        }
    }

    /**
     * Compares one pair of source strings.
     * @param {{ path?: string, leftText?: string, rightText?: string, leftLabel?: string, rightLabel?: string }} [options] Text diff options.
     * @returns {object}
     */
    static compareText(options = {}) {
        const path = KicadSemanticDiffReportBuilder.#path(options.path, 'entry')
        return KicadSemanticDiffReportBuilder.build({
            leftLabel: options.leftLabel,
            rightLabel: options.rightLabel,
            leftEntries: [
                {
                    path,
                    text: String(options.leftText ?? '')
                }
            ],
            rightEntries: [
                {
                    path,
                    text: String(options.rightText ?? '')
                }
            ]
        })
    }

    /**
     * Builds one path-keyed entry map.
     * @param {object[] | undefined} entries Candidate entries.
     * @param {object[]} diagnostics Diagnostics sink.
     * @param {string} label Side label.
     * @returns {Map<string, object>}
     */
    static #entryMap(entries, diagnostics, label) {
        const map = new Map()
        for (const entry of KicadSemanticDiffReportBuilder.#entryRows(
            entries
        )) {
            if (map.has(entry.path)) {
                diagnostics.push(
                    KicadSemanticDiffReportBuilder.#diagnostic(
                        'kicad-semantic-diff.duplicate-entry',
                        'Semantic diff input contains duplicate entry paths.',
                        { label, path: entry.path }
                    )
                )
                continue
            }
            map.set(entry.path, entry)
        }
        return map
    }

    /**
     * Normalizes caller-provided entry rows.
     * @param {object[] | undefined} entries Candidate entries.
     * @returns {{ path: string, text: string }[]}
     */
    static #entryRows(entries) {
        if (!Array.isArray(entries)) return []
        return entries
            .map((entry) => KicadSemanticDiffReportBuilder.#entryRow(entry))
            .filter((entry) => entry.path)
    }

    /**
     * Normalizes one caller-provided entry row.
     * @param {object} entry Candidate entry.
     * @returns {{ path: string, text: string }}
     */
    static #entryRow(entry) {
        const source = entry && typeof entry === 'object' ? entry : {}
        return {
            path: KicadSemanticDiffReportBuilder.#path(
                source.path || source.name || source.fileName,
                ''
            ),
            text: KicadSemanticDiffReportBuilder.#entryText(source)
        }
    }

    /**
     * Resolves entry text from text-like or byte-like fields.
     * @param {object} entry Entry source.
     * @returns {string}
     */
    static #entryText(entry) {
        if (typeof entry.text === 'string') return entry.text
        if (typeof entry.content === 'string') return entry.content
        if (typeof entry.source === 'string') return entry.source
        return KicadSemanticDiffReportBuilder.#decodeBytes(entry.bytes)
    }

    /**
     * Decodes byte-like values.
     * @param {unknown} bytes Candidate bytes.
     * @returns {string}
     */
    static #decodeBytes(bytes) {
        if (bytes instanceof Uint8Array) return textDecoder.decode(bytes)
        if (bytes instanceof ArrayBuffer) {
            return textDecoder.decode(new Uint8Array(bytes))
        }
        if (Array.isArray(bytes)) {
            return textDecoder.decode(Uint8Array.from(bytes))
        }
        return ''
    }

    /**
     * Compares one entry path.
     * @param {{ path: string, leftEntry?: object, rightEntry?: object, leftLabel: string, rightLabel: string, diagnostics: object[] }} context Diff context.
     * @returns {object}
     */
    static #entryDiff(context) {
        if (!context.leftEntry) {
            const normalized = KicadSemanticDiffReportBuilder.#normalizeEntry(
                context.rightEntry,
                context.diagnostics
            )
            return KicadSemanticDiffReportBuilder.#row({
                path: context.path,
                status: 'only-in-right',
                normalizationKind: normalized.kind,
                leftLabel: context.leftLabel,
                rightLabel: context.rightLabel,
                differences: []
            })
        }

        if (!context.rightEntry) {
            const normalized = KicadSemanticDiffReportBuilder.#normalizeEntry(
                context.leftEntry,
                context.diagnostics
            )
            return KicadSemanticDiffReportBuilder.#row({
                path: context.path,
                status: 'only-in-left',
                normalizationKind: normalized.kind,
                leftLabel: context.leftLabel,
                rightLabel: context.rightLabel,
                differences: []
            })
        }

        const left = KicadSemanticDiffReportBuilder.#normalizeEntry(
            context.leftEntry,
            context.diagnostics
        )
        const right = KicadSemanticDiffReportBuilder.#normalizeEntry(
            context.rightEntry,
            context.diagnostics
        )
        const differences =
            left.text === right.text
                ? []
                : KicadSemanticDiffReportBuilder.#lineDifferences(
                      left.text,
                      right.text
                  )
        const normalizationKind =
            left.kind === right.kind ? left.kind : left.kind + '/' + right.kind

        return KicadSemanticDiffReportBuilder.#row({
            path: context.path,
            status: differences.length ? 'different' : 'identical',
            normalizationKind,
            leftLabel: context.leftLabel,
            rightLabel: context.rightLabel,
            differences
        })
    }

    /**
     * Builds one stable report row.
     * @param {object} row Row fields.
     * @returns {object}
     */
    static #row(row) {
        return {
            path: row.path,
            status: row.status,
            normalizationKind: row.normalizationKind,
            leftLabel: row.leftLabel,
            rightLabel: row.rightLabel,
            differences: row.differences
        }
    }

    /**
     * Normalizes one entry by detected KiCad source format.
     * @param {object} entry Entry row.
     * @param {object[]} diagnostics Diagnostics sink.
     * @returns {{ kind: string, text: string }}
     */
    static #normalizeEntry(entry, diagnostics) {
        const path = KicadSemanticDiffReportBuilder.#path(entry?.path, '')
        const text = String(entry?.text ?? '')
        const trimmed = text.trim()

        if (
            KicadSemanticDiffReportBuilder.#isJsonPath(path) ||
            trimmed.startsWith('{') ||
            trimmed.startsWith('[')
        ) {
            return KicadSemanticDiffReportBuilder.#normalizeJson(
                path,
                text,
                diagnostics
            )
        }

        if (
            KicadSemanticDiffReportBuilder.#isSExpressionPath(path) ||
            trimmed.startsWith('(')
        ) {
            return KicadSemanticDiffReportBuilder.#normalizeSExpression(
                path,
                text,
                diagnostics
            )
        }

        return {
            kind: 'text',
            text: KicadSemanticDiffReportBuilder.#normalizeText(text)
        }
    }

    /**
     * Normalizes JSON source.
     * @param {string} path Entry path.
     * @param {string} text Source text.
     * @param {object[]} diagnostics Diagnostics sink.
     * @returns {{ kind: string, text: string }}
     */
    static #normalizeJson(path, text, diagnostics) {
        try {
            return {
                kind: 'json',
                text: JSON.stringify(
                    KicadSemanticDiffReportBuilder.#normalizeJsonValue(
                        JSON.parse(text)
                    ),
                    null,
                    2
                )
            }
        } catch (error) {
            diagnostics.push(
                KicadSemanticDiffReportBuilder.#diagnostic(
                    'kicad-semantic-diff.json-parse-failed',
                    'Semantic diff input is not valid JSON.',
                    { path, error }
                )
            )
            return {
                kind: 'text',
                text: KicadSemanticDiffReportBuilder.#normalizeText(text)
            }
        }
    }

    /**
     * Normalizes JSON values recursively.
     * @param {unknown} value JSON value.
     * @param {string} [key] Parent key.
     * @returns {unknown}
     */
    static #normalizeJsonValue(value, key = '') {
        if (volatileJsonKeys.has(key)) return volatileJsonKeys.get(key)
        if (Array.isArray(value)) {
            if (key === 'sheets') {
                return value.map((item) =>
                    KicadSemanticDiffReportBuilder.#normalizeSheetTuple(item)
                )
            }
            return value.map((item) =>
                KicadSemanticDiffReportBuilder.#normalizeJsonValue(item)
            )
        }
        if (!value || typeof value !== 'object') return value

        return Object.fromEntries(
            Object.entries(value)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([childKey, childValue]) => [
                    childKey,
                    KicadSemanticDiffReportBuilder.#normalizeJsonValue(
                        childValue,
                        childKey
                    )
                ])
        )
    }

    /**
     * Normalizes project sheet tuple IDs while preserving sheet names.
     * @param {unknown} value Sheet tuple candidate.
     * @returns {unknown}
     */
    static #normalizeSheetTuple(value) {
        if (!Array.isArray(value) || value.length === 0) {
            return KicadSemanticDiffReportBuilder.#normalizeJsonValue(value)
        }
        return [
            '__SHEET_ID__',
            ...value
                .slice(1)
                .map((item) =>
                    KicadSemanticDiffReportBuilder.#normalizeJsonValue(item)
                )
        ]
    }

    /**
     * Normalizes S-expression source.
     * @param {string} path Entry path.
     * @param {string} text Source text.
     * @param {object[]} diagnostics Diagnostics sink.
     * @returns {{ kind: string, text: string }}
     */
    static #normalizeSExpression(path, text, diagnostics) {
        try {
            const root = SExpressionParser.parse(text)
            return {
                kind: 'sexpr',
                text: KicadSemanticDiffReportBuilder.#serializeSExpression(
                    KicadSemanticDiffReportBuilder.#normalizeSExpressionNode(
                        root
                    )
                )
            }
        } catch (error) {
            diagnostics.push(
                KicadSemanticDiffReportBuilder.#diagnostic(
                    'kicad-semantic-diff.sexpr-parse-failed',
                    'Semantic diff input is not a valid S-expression document.',
                    { path, error }
                )
            )
            return {
                kind: 'text',
                text: KicadSemanticDiffReportBuilder.#normalizeText(text)
            }
        }
    }

    /**
     * Normalizes volatile S-expression nodes recursively.
     * @param {unknown} value S-expression value.
     * @returns {unknown}
     */
    static #normalizeSExpressionNode(value) {
        if (!Array.isArray(value)) return value
        const head = String(value[0] ?? '')
        if (volatileSExpressionFields.has(head)) {
            return [head, volatileSExpressionFields.get(head)]
        }
        return value.map((child) =>
            KicadSemanticDiffReportBuilder.#normalizeSExpressionNode(child)
        )
    }

    /**
     * Serializes a normalized S-expression value.
     * @param {unknown} value S-expression value.
     * @param {boolean} [isHead] Whether the value is a list head.
     * @returns {string}
     */
    static #serializeSExpression(value, isHead = false) {
        if (Array.isArray(value)) {
            return (
                '(' +
                value
                    .map((child, index) =>
                        KicadSemanticDiffReportBuilder.#serializeSExpression(
                            child,
                            index === 0
                        )
                    )
                    .join(' ') +
                ')'
            )
        }
        if (typeof value === 'number') {
            return Number.isFinite(value) ? String(value) : '0'
        }
        if (typeof value === 'boolean') return value ? 'yes' : 'no'

        const text = String(value ?? '')
        if (
            isHead ||
            placeholderAtoms.has(text) ||
            KicadSemanticDiffReportBuilder.#isBareAtom(text)
        ) {
            return text || '""'
        }
        return KicadSemanticDiffReportBuilder.#quoteSExpressionString(text)
    }

    /**
     * Quotes one S-expression string.
     * @param {string} value Raw value.
     * @returns {string}
     */
    static #quoteSExpressionString(value) {
        return (
            '"' +
            value
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t') +
            '"'
        )
    }

    /**
     * Returns whether a value can be emitted as a bare atom.
     * @param {string} value Candidate value.
     * @returns {boolean}
     */
    static #isBareAtom(value) {
        return /^[a-z_][a-z0-9_-]*$/u.test(value)
    }

    /**
     * Normalizes plain text source.
     * @param {string} text Source text.
     * @returns {string}
     */
    static #normalizeText(text) {
        return String(text ?? '')
            .replace(/\r\n?/gu, '\n')
            .split('\n')
            .map((line) => line.trimEnd())
            .join('\n')
            .trim()
    }

    /**
     * Builds line-level differences.
     * @param {string} leftText Left text.
     * @param {string} rightText Right text.
     * @returns {object[]}
     */
    static #lineDifferences(leftText, rightText) {
        const leftLines = String(leftText).split('\n')
        const rightLines = String(rightText).split('\n')
        const count = Math.max(leftLines.length, rightLines.length)
        const differences = []

        for (let index = 0; index < count; index += 1) {
            if (leftLines[index] === rightLines[index]) continue
            differences.push({
                line: index + 1,
                left: leftLines[index] ?? null,
                right: rightLines[index] ?? null
            })
        }

        return differences
    }

    /**
     * Builds a report summary.
     * @param {object[]} entries Report rows.
     * @param {object[]} diagnostics Diagnostics.
     * @returns {object}
     */
    static #summary(entries, diagnostics) {
        const identicalCount = KicadSemanticDiffReportBuilder.#statusCount(
            entries,
            'identical'
        )
        const differentCount = KicadSemanticDiffReportBuilder.#statusCount(
            entries,
            'different'
        )
        const onlyInLeftCount = KicadSemanticDiffReportBuilder.#statusCount(
            entries,
            'only-in-left'
        )
        const onlyInRightCount = KicadSemanticDiffReportBuilder.#statusCount(
            entries,
            'only-in-right'
        )

        return {
            entryCount: entries.length,
            identicalCount,
            differentCount,
            onlyInLeftCount,
            onlyInRightCount,
            diagnosticCount: diagnostics.length,
            differenceCount: differentCount + onlyInLeftCount + onlyInRightCount
        }
    }

    /**
     * Counts rows by status.
     * @param {object[]} entries Report rows.
     * @param {string} status Status value.
     * @returns {number}
     */
    static #statusCount(entries, status) {
        return entries.filter((entry) => entry.status === status).length
    }

    /**
     * Normalizes a label.
     * @param {unknown} value Candidate label.
     * @param {string} fallback Fallback label.
     * @returns {string}
     */
    static #label(value, fallback) {
        const label = String(value || '').trim()
        return label || fallback
    }

    /**
     * Normalizes a path-like value.
     * @param {unknown} value Candidate path.
     * @param {string} fallback Fallback path.
     * @returns {string}
     */
    static #path(value, fallback) {
        return String(value || fallback || '')
            .replace(/\\/gu, '/')
            .replace(/^\/+/u, '')
            .replace(/\/+/gu, '/')
    }

    /**
     * Returns whether a path denotes JSON-like KiCad project source.
     * @param {string} path Entry path.
     * @returns {boolean}
     */
    static #isJsonPath(path) {
        return /\.(json|kicad_pro|kicad_prl)$/iu.test(path)
    }

    /**
     * Returns whether a path denotes KiCad S-expression source.
     * @param {string} path Entry path.
     * @returns {boolean}
     */
    static #isSExpressionPath(path) {
        return /\.(kicad_pcb|kicad_sch|kicad_sym|kicad_mod|kicad_wks|net)$/iu.test(
            path
        )
    }

    /**
     * Builds one diagnostic row.
     * @param {string} code Diagnostic code.
     * @param {string} message Diagnostic message.
     * @param {object} [details] Additional fields.
     * @returns {object}
     */
    static #diagnostic(code, message, details = {}) {
        const { error, ...rest } = details
        return {
            severity: 'warning',
            code,
            message,
            ...rest,
            ...(error ? { error: String(error.message || error) } : {})
        }
    }
}
