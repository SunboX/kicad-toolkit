// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadLayerResolver } from './KicadLayerResolver.mjs'

const issueListKeys = Object.freeze(
    new Set([
        'violations',
        'warnings',
        'errors',
        'exclusions',
        'unconnected_items',
        'schematic_parity',
        'items'
    ])
)

/**
 * Builds normalized issue summaries and board-readiness reports.
 */
export class KicadReadinessReport {
    /**
     * Parses caller-supplied DRC report data into normalized issues.
     * @param {string | object | object[]} report Report JSON string or object.
     * @param {object} [options] Parse options.
     * @returns {object}
     */
    static parseDrcReport(report, options = {}) {
        return parseReport('drc', report, options)
    }

    /**
     * Summarizes caller-supplied DRC report data.
     * @param {string | object | object[]} report Report JSON string or object.
     * @param {object} [options] Summary options.
     * @returns {object}
     */
    static summarizeDrcReport(report, options = {}) {
        return summarizeReport('drc', report, options)
    }

    /**
     * Parses caller-supplied ERC report data into normalized issues.
     * @param {string | object | object[]} report Report JSON string or object.
     * @param {object} [options] Parse options.
     * @returns {object}
     */
    static parseErcReport(report, options = {}) {
        return parseReport('erc', report, options)
    }

    /**
     * Summarizes caller-supplied ERC report data.
     * @param {string | object | object[]} report Report JSON string or object.
     * @param {object} [options] Summary options.
     * @returns {object}
     */
    static summarizeErcReport(report, options = {}) {
        return summarizeReport('erc', report, options)
    }

    /**
     * Assesses fabrication readiness using recovered board model data only.
     * @param {object} input Board model or parser document model.
     * @returns {object}
     */
    static fabricationReadiness(input) {
        const board = resolveBoard(input)
        const statistics = boardStatistics(board)
        const outline = outlineReport(board)
        const connectivity = connectivityReport(board)
        const findings = readinessFindings(board, {
            statistics,
            outline,
            connectivity
        })
        const findingCounts = countFindings(findings)
        const readiness =
            findingCounts.blocker > 0
                ? 'blocked'
                : findingCounts.warning > 0
                  ? 'review'
                  : 'ready'

        return {
            ok: findingCounts.blocker === 0,
            readiness,
            score: readinessScore(findings),
            findingCounts,
            findings,
            statistics,
            outline,
            connectivity,
            bounds: board.bounds || null
        }
    }
}

/**
 * Parses one report kind into normalized issues.
 * @param {'drc' | 'erc'} reportType Report type.
 * @param {string | object | object[]} report Report data.
 * @param {object} options Parse options.
 * @returns {object}
 */
function parseReport(reportType, report, options = {}) {
    const limit = Math.max(0, Number(options.limit ?? 200))
    const includeItems = options.includeItems !== false
    const issues = []

    for (const [category, rows] of iterateIssueLists(readReportInput(report))) {
        for (const row of rows) {
            if (!isObject(row)) continue
            const issue = normalizeIssue(row, category)
            if (!matchesFilter(issue, options)) continue
            if (!includeItems) {
                delete issue.items
                delete issue.details
            }
            issues.push(issue)
        }
    }

    const limited = limit === 0 ? [] : issues.slice(0, limit)
    return {
        reportType,
        total: issues.length,
        returned: limited.length,
        truncated: limited.length < issues.length,
        bySeverity: countIssues(issues, 'severity'),
        byRule: countIssues(issues, 'rule'),
        byCategory: countIssues(issues, 'category'),
        issues: limited
    }
}

/**
 * Summarizes one report kind.
 * @param {'drc' | 'erc'} reportType Report type.
 * @param {string | object | object[]} report Report data.
 * @param {object} options Summary options.
 * @returns {object}
 */
function summarizeReport(reportType, report, options = {}) {
    const parsed = parseReport(reportType, report, {
        ...options,
        includeItems: false,
        limit: Math.max(0, Number(options.exampleLimit ?? 5))
    })
    return {
        reportType: parsed.reportType,
        total: parsed.total,
        bySeverity: parsed.bySeverity,
        byRule: parsed.byRule,
        byCategory: parsed.byCategory,
        examples: parsed.issues
    }
}

/**
 * Reads a report from object or JSON string input.
 * @param {string | object | object[]} report Report input.
 * @returns {unknown}
 */
function readReportInput(report) {
    if (typeof report === 'string') {
        return JSON.parse(report)
    }
    return report
}

/**
 * Iterates nested issue lists in report data.
 * @param {unknown} data Report data.
 * @param {string} [category] Current category.
 * @returns {Iterable<[string, unknown[]]>}
 */
function* iterateIssueLists(data, category = 'items') {
    if (Array.isArray(data)) {
        if (data.every(isIssueLike)) yield [category, data]
        return
    }
    if (!isObject(data)) return

    for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
            if (issueListKeys.has(key) || value.every(isIssueLike)) {
                yield [key, value]
            }
        } else if (isObject(value)) {
            yield* iterateIssueLists(value, key)
        }
    }
}

/**
 * Returns whether a value looks like a report issue.
 * @param {unknown} value Value.
 * @returns {boolean}
 */
function isIssueLike(value) {
    if (!isObject(value)) return false
    return [
        'severity',
        'level',
        'rule',
        'type',
        'description',
        'message',
        'items',
        'pos',
        'uuid'
    ].some((key) => Object.hasOwn(value, key))
}

/**
 * Normalizes one issue record.
 * @param {Record<string, unknown>} row Raw issue.
 * @param {string} category Issue category.
 * @returns {object}
 */
function normalizeIssue(row, category) {
    const issue = {
        category,
        severity: stringField(
            row,
            ['severity', 'level'],
            severityForCategory(category)
        ).toLowerCase(),
        rule: stringField(
            row,
            ['rule', 'type', 'code', 'constraint', 'name'],
            category
        ),
        message: stringField(
            row,
            ['description', 'message', 'text', 'title'],
            ''
        )
    }

    for (const key of ['items', 'pos', 'uuid', 'excluded', 'details']) {
        if (Object.hasOwn(row, key)) issue[key] = row[key]
    }

    return issue
}

/**
 * Infers severity from issue category.
 * @param {string} category Issue category.
 * @returns {string}
 */
function severityForCategory(category) {
    const value = category.toLowerCase()
    if (value.includes('warning')) return 'warning'
    if (value.includes('exclusion')) return 'excluded'
    if (value.includes('unconnected')) return 'warning'
    return 'error'
}

/**
 * Reads the first string field from a record.
 * @param {Record<string, unknown>} row Source record.
 * @param {string[]} names Field names.
 * @param {string} fallback Fallback value.
 * @returns {string}
 */
function stringField(row, names, fallback) {
    for (const name of names) {
        if (row[name] !== undefined && row[name] !== null) {
            return String(row[name])
        }
    }
    return fallback
}

/**
 * Returns whether an issue matches filters.
 * @param {object} issue Normalized issue.
 * @param {object} options Filter options.
 * @returns {boolean}
 */
function matchesFilter(issue, options) {
    return (
        matchesTextFilter(issue.severity, options.severity) &&
        matchesTextFilter(issue.rule, options.rule) &&
        matchesTextFilter(issue.category, options.category)
    )
}

/**
 * Applies a case-insensitive optional text filter.
 * @param {unknown} value Value.
 * @param {unknown} filter Filter.
 * @returns {boolean}
 */
function matchesTextFilter(value, filter) {
    if (filter === undefined || filter === null || filter === '') return true
    return String(value || '').toLowerCase() === String(filter).toLowerCase()
}

/**
 * Counts issues by key.
 * @param {object[]} issues Issues.
 * @param {string} key Key.
 * @returns {Record<string, number>}
 */
function countIssues(issues, key) {
    const counts = {}
    for (const issue of issues) {
        const value = String(issue[key] || '')
        counts[value] = (counts[value] || 0) + 1
    }
    return counts
}

/**
 * Resolves a board object from raw or wrapped parser output.
 * @param {object} input Input model.
 * @returns {object}
 */
function resolveBoard(input) {
    return input?.pcb?.kicadBoard || input?.kicadBoard || input || {}
}

/**
 * Builds compact board statistics.
 * @param {object} board Board model.
 * @returns {object}
 */
function boardStatistics(board) {
    const drawings = array(board.drawings)
    return {
        footprintCount: array(board.footprints).length,
        padCount: array(board.pads).length,
        netCount: array(board.nets).filter((net) => net.name !== '').length,
        trackCount: drawings.filter((drawing) => drawing.type === 'segment')
            .length,
        viaCount: drawings.filter((drawing) => drawing.type === 'via').length,
        zoneCount: drawings.filter((drawing) => drawing.type === 'zone').length,
        copperLayerCount: copperLayers(board).length
    }
}

/**
 * Returns declared copper layer names.
 * @param {object} board Board model.
 * @returns {string[]}
 */
function copperLayers(board) {
    const declared = array(board.layers)
        .map((layer) => layer.name)
        .filter((name) => KicadLayerResolver.isCopperLayer(name))
    if (declared.length > 0) return declared

    const names = new Set()
    for (const drawing of array(board.drawings)) {
        if (KicadLayerResolver.isCopperLayer(drawing.layer)) {
            names.add(KicadLayerResolver.normalizeLayerName(drawing.layer))
        }
    }
    for (const pad of array(board.pads)) {
        for (const layer of array(pad.layers)) {
            if (KicadLayerResolver.isCopperLayer(layer)) {
                names.add(KicadLayerResolver.normalizeLayerName(layer))
            }
        }
    }
    return [...names]
}

/**
 * Builds an outline report.
 * @param {object} board Board model.
 * @returns {object}
 */
function outlineReport(board) {
    const outlines = array(board.outlines)
    return {
        itemCount: outlines.length,
        openEndpointCount: openOutlineEndpointCount(outlines)
    }
}

/**
 * Counts unmatched line endpoints in outline items.
 * @param {object[]} outlines Outline items.
 * @returns {number}
 */
function openOutlineEndpointCount(outlines) {
    const counts = new Map()
    for (const outline of outlines) {
        if (outline.type !== 'line' || !outline.start || !outline.end) continue
        addEndpoint(counts, outline.start)
        addEndpoint(counts, outline.end)
    }
    return [...counts.values()].filter((count) => count % 2 === 1).length
}

/**
 * Adds one rounded endpoint to a map.
 * @param {Map<string, number>} counts Endpoint counts.
 * @param {{ x: number, y: number }} point Point.
 * @returns {void}
 */
function addEndpoint(counts, point) {
    const key = `${roundCoordinate(point.x)},${roundCoordinate(point.y)}`
    counts.set(key, (counts.get(key) || 0) + 1)
}

/**
 * Rounds a coordinate for endpoint matching.
 * @param {number} value Coordinate.
 * @returns {number}
 */
function roundCoordinate(value) {
    return Number((Number(value) || 0).toFixed(6))
}

/**
 * Builds connectivity report data.
 * @param {object} board Board model.
 * @returns {object}
 */
function connectivityReport(board) {
    const padsByNet = groupPadsByNet(board)
    const routedNets = routedNetNames(board)
    const unroutedNets = [...padsByNet.entries()]
        .filter(
            ([netName, pads]) =>
                netName && pads.length > 1 && !routedNets.has(netName)
        )
        .map(([netName, pads]) => ({ netName, padCount: pads.length }))

    return {
        noNetPadCount: array(board.pads).filter((pad) => !pad.netName).length,
        unroutedNetCount: unroutedNets.length,
        unroutedNets
    }
}

/**
 * Groups pads by net name.
 * @param {object} board Board model.
 * @returns {Map<string, object[]>}
 */
function groupPadsByNet(board) {
    const groups = new Map()
    for (const pad of array(board.pads)) {
        const netName = String(pad.netName || '')
        if (!groups.has(netName)) groups.set(netName, [])
        groups.get(netName).push(pad)
    }
    return groups
}

/**
 * Returns routed net names from tracks, vias, and zones.
 * @param {object} board Board model.
 * @returns {Set<string>}
 */
function routedNetNames(board) {
    return new Set(
        array(board.drawings)
            .filter((drawing) =>
                ['segment', 'via', 'zone'].includes(String(drawing.type || ''))
            )
            .map((drawing) => String(drawing.netName || ''))
            .filter(Boolean)
    )
}

/**
 * Builds readiness findings.
 * @param {object} board Board model.
 * @param {{ statistics: object, outline: object, connectivity: object }} reports Precomputed reports.
 * @returns {object[]}
 */
function readinessFindings(board, reports) {
    const findings = []
    if (reports.statistics.copperLayerCount < 2) {
        findings.push(
            finding(
                'blocker',
                'insufficient_copper_layers',
                reports.statistics.copperLayerCount,
                'Board should define at least front and back copper layers before fabrication.'
            )
        )
    }
    if (reports.outline.itemCount === 0) {
        findings.push(
            finding(
                'blocker',
                'missing_board_outline',
                1,
                'No Edge.Cuts outline items were found.'
            )
        )
    } else if (reports.outline.openEndpointCount > 0) {
        findings.push(
            finding(
                'blocker',
                'open_board_outline',
                reports.outline.openEndpointCount,
                'Edge.Cuts outline has unmatched line endpoints.'
            )
        )
    }
    if (reports.statistics.footprintCount === 0) {
        findings.push(
            finding(
                'warning',
                'no_footprints',
                1,
                'Board contains no footprints.'
            )
        )
    }
    if (reports.connectivity.unroutedNetCount > 0) {
        findings.push(
            finding(
                'blocker',
                'unrouted_nets',
                reports.connectivity.unroutedNetCount,
                'One or more multi-pad nets have no routed copper.'
            )
        )
    }
    if (reports.connectivity.noNetPadCount > 0) {
        findings.push(
            finding(
                'warning',
                'no_net_pads',
                reports.connectivity.noNetPadCount,
                'Some pads have no assigned net.'
            )
        )
    }
    const missingModels = missingModelCount(board)
    if (missingModels > 0) {
        findings.push(
            finding(
                'info',
                'missing_3d_models',
                missingModels,
                'Some footprints do not expose visible 3D model metadata.'
            )
        )
    }
    return findings
}

/**
 * Counts footprints without visible model metadata.
 * @param {object} board Board model.
 * @returns {number}
 */
function missingModelCount(board) {
    return array(board.footprints).filter((footprint) => {
        return !array(footprint.models).some((model) => model.visible !== false)
    }).length
}

/**
 * Builds one finding object.
 * @param {'blocker' | 'warning' | 'info'} severity Severity.
 * @param {string} kind Finding kind.
 * @param {number} count Finding count.
 * @param {string} message Message.
 * @returns {object}
 */
function finding(severity, kind, count, message) {
    return { severity, kind, count, message }
}

/**
 * Counts findings by severity.
 * @param {object[]} findings Findings.
 * @returns {{ blocker: number, warning: number, info: number }}
 */
function countFindings(findings) {
    return {
        blocker: findings.filter((finding) => finding.severity === 'blocker')
            .length,
        warning: findings.filter((finding) => finding.severity === 'warning')
            .length,
        info: findings.filter((finding) => finding.severity === 'info').length
    }
}

/**
 * Scores readiness from findings.
 * @param {object[]} findings Findings.
 * @returns {number}
 */
function readinessScore(findings) {
    const penalty = findings.reduce((total, finding) => {
        if (finding.severity === 'blocker') return total + 35
        if (finding.severity === 'warning') return total + 15
        return total + 3
    }, 0)
    return Math.max(0, 100 - penalty)
}

/**
 * Normalizes an array-like value.
 * @param {unknown} value Value.
 * @returns {unknown[]}
 */
function array(value) {
    return Array.isArray(value) ? value : []
}

/**
 * Checks for plain object-like values.
 * @param {unknown} value Value.
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}
