// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { SExpressionParser } from './SExpressionParser.mjs'
import { SExpressionTree } from './SExpressionTree.mjs'

const schemaId = 'kicad-toolkit.source.coverage.a1'

const knownNodeFamilies = Object.freeze({
    kicad_sch: 'root',
    kicad_pcb: 'root',
    footprint: 'component',
    kicad_symbol_lib: 'root',
    symbol: 'component',
    version: 'metadata',
    generator: 'metadata',
    generator_version: 'metadata',
    uuid: 'metadata',
    paper: 'metadata',
    title_block: 'metadata',
    property: 'metadata',
    lib_id: 'metadata',
    at: 'geometry',
    pts: 'geometry',
    xy: 'geometry',
    start: 'geometry',
    end: 'geometry',
    center: 'geometry',
    radius: 'geometry',
    size: 'geometry',
    stroke: 'style',
    fill: 'style',
    effects: 'style',
    font: 'style',
    justify: 'style',
    layer: 'layer',
    layers: 'layer',
    net: 'connectivity',
    nets: 'connectivity',
    pin: 'connectivity',
    pad: 'connectivity',
    wire: 'connectivity',
    bus: 'connectivity',
    bus_entry: 'connectivity',
    junction: 'connectivity',
    no_connect: 'connectivity',
    label: 'connectivity',
    global_label: 'connectivity',
    hierarchical_label: 'connectivity',
    sheet: 'sheet',
    sheet_instances: 'sheet',
    symbol_instances: 'sheet',
    sheetname: 'sheet',
    sheetfile: 'sheet',
    lib_symbols: 'library',
    fp_text: 'text',
    gr_text: 'text',
    gr_text_box: 'text',
    text: 'text',
    value: 'text',
    segment: 'copper',
    via: 'copper',
    arc: 'graphic',
    gr_arc: 'graphic',
    gr_circle: 'graphic',
    gr_curve: 'graphic',
    gr_line: 'graphic',
    gr_poly: 'graphic',
    gr_rect: 'graphic',
    image: 'graphic',
    dimension: 'graphic',
    zone: 'zone',
    keepout: 'zone',
    filled_polygon: 'zone',
    polygon: 'graphic',
    group: 'group',
    setup: 'board-setup',
    stackup: 'board-setup',
    plot_settings: 'board-setup'
})

const typedNodeNames = new Set([
    'kicad_sch',
    'kicad_pcb',
    'footprint',
    'kicad_symbol_lib',
    'symbol',
    'version',
    'generator',
    'generator_version',
    'property',
    'lib_id',
    'pin',
    'pad',
    'wire',
    'bus',
    'bus_entry',
    'junction',
    'no_connect',
    'label',
    'global_label',
    'hierarchical_label',
    'sheet',
    'sheet_instances',
    'symbol_instances',
    'sheetname',
    'sheetfile',
    'lib_symbols',
    'fp_text',
    'gr_text',
    'gr_text_box',
    'text',
    'segment',
    'via',
    'arc',
    'gr_arc',
    'gr_circle',
    'gr_curve',
    'gr_line',
    'gr_poly',
    'gr_rect',
    'image',
    'dimension',
    'zone',
    'keepout',
    'filled_polygon',
    'polygon',
    'group',
    'setup',
    'stackup',
    'plot_settings'
])

/**
 * Builds parser coverage reports from preserved KiCad S-expression nodes.
 */
export class KicadSourceCoverageReportBuilder {
    /**
     * Builds a deterministic node coverage report.
     * @param {object | Array | string} input Parsed model, AST, or source text.
     * @returns {object}
     */
    static build(input = {}) {
        const root = resolveRoot(input)
        const fileName =
            typeof input === 'object' && !Array.isArray(input)
                ? String(input.fileName || '')
                : ''
        const rows = nodeRows(root)
        const nodesByName = Object.fromEntries(
            rows.map((row) => [row.name, row])
        )
        const unsupported = rows.filter((row) => !row.known)
        const typed = rows.filter((row) => row.typed)
        const knownUntyped = rows.filter((row) => row.known && !row.typed)
        const preservedOnly = rows.filter((row) => !row.typed)
        const metadata = root ? SExpressionTree.describe(root) : emptyMetadata()
        const diagnostics = diagnosticsForRows(preservedOnly)

        return {
            schema: schemaId,
            sourceFormat: 'kicad',
            fileName,
            summary: {
                rootName: metadata.rootName,
                nodeCount: metadata.nodeCount,
                supportedNodeCount: rows
                    .filter((row) => row.supported)
                    .reduce((total, row) => total + row.count, 0),
                typedNodeCount: typed.reduce(
                    (total, row) => total + row.count,
                    0
                ),
                knownUntypedNodeCount: knownUntyped.reduce(
                    (total, row) => total + row.count,
                    0
                ),
                preservedOnlyNodeCount: preservedOnly.reduce(
                    (total, row) => total + row.count,
                    0
                ),
                unsupportedNodeCount: unsupported.length,
                unknownNodeCount: unsupported.reduce(
                    (total, row) => total + row.count,
                    0
                ),
                maxDepth: metadata.maxDepth,
                diagnosticCount: diagnostics.length
            },
            nodes: rows,
            nodesByName,
            diagnostics,
            indexes: {
                nodeNamesBySupport: {
                    supported: rows
                        .filter((row) => row.supported)
                        .map((row) => row.name),
                    typed: typed.map((row) => row.name),
                    knownUntyped: knownUntyped.map((row) => row.name),
                    unsupported: unsupported.map((row) => row.name)
                },
                nodeNamesByFamily: nodeNamesByFamily(rows)
            }
        }
    }
}

/**
 * Resolves an S-expression root from accepted input shapes.
 * @param {object | Array | string} input Input value.
 * @returns {Array | null}
 */
function resolveRoot(input) {
    if (Array.isArray(input)) return input
    if (typeof input === 'string') return SExpressionParser.parse(input)
    if (Array.isArray(input?.schematic?.kicadAst))
        return input.schematic.kicadAst
    if (Array.isArray(input?.kicadAst)) return input.kicadAst
    if (Array.isArray(input?.rawRules)) return input.rawRules
    if (Array.isArray(input?.rawWorksheet)) return input.rawWorksheet
    if (typeof input?.source === 'string')
        return SExpressionParser.parse(input.source)
    return null
}

/**
 * Builds node summary rows.
 * @param {Array | null} root S-expression root.
 * @returns {object[]}
 */
function nodeRows(root) {
    const counts = new Map()
    const maxDepths = new Map()
    visit(root, 0, (name, depth) => {
        counts.set(name, (counts.get(name) || 0) + 1)
        maxDepths.set(name, Math.max(maxDepths.get(name) || 0, depth))
    })

    return [...counts.keys()].sort().map((name) => {
        const family = knownNodeFamilies[name] || 'unknown'
        const known = family !== 'unknown'
        const typed = typedNodeNames.has(name)
        return {
            name,
            count: counts.get(name),
            family,
            supported: known,
            known,
            typed,
            preserved: true,
            coverageStatus: typed
                ? 'typed'
                : known
                  ? 'known-untyped'
                  : 'unknown',
            maxDepth: maxDepths.get(name) || 0
        }
    })
}

/**
 * Builds coverage diagnostics for nodes without first-class typed rows.
 * @param {object[]} rows Coverage rows.
 * @returns {object[]}
 */
function diagnosticsForRows(rows) {
    return rows.map((row) => {
        const known = row.known === true
        return {
            code: known
                ? 'kicad.source-coverage.known-untyped-node'
                : 'kicad.source-coverage.unknown-node',
            severity: 'info',
            nodeName: row.name,
            message: known
                ? 'KiCad S-expression node is known and preserved without a first-class typed parser row.'
                : 'KiCad S-expression node is preserved without a recognized parser family.'
        }
    })
}

/**
 * Visits all S-expression list nodes.
 * @param {Array | null} node Candidate node.
 * @param {number} depth Current depth.
 * @param {(name: string, depth: number) => void} visitor Visitor callback.
 * @returns {void}
 */
function visit(node, depth, visitor) {
    if (!Array.isArray(node)) return
    const name = String(node[0] || '')
    if (name) visitor(name, depth)
    node.filter(Array.isArray).forEach((child) =>
        visit(child, depth + 1, visitor)
    )
}

/**
 * Groups node names by family.
 * @param {object[]} rows Node rows.
 * @returns {Record<string, string[]>}
 */
function nodeNamesByFamily(rows) {
    const groups = {}
    for (const row of rows) {
        groups[row.family] ||= []
        groups[row.family].push(row.name)
    }
    return Object.fromEntries(Object.entries(groups).sort())
}

/**
 * Returns empty metadata for missing roots.
 * @returns {object}
 */
function emptyMetadata() {
    return {
        rootName: '',
        nodeCount: 0,
        maxDepth: 0
    }
}
