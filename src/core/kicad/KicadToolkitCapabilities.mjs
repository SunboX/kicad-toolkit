// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const categoryInfo = Object.freeze({
    parser: {
        label: 'Parser',
        description:
            'Native KiCad document parsing and Circuit JSON projection.'
    },
    project_loading: {
        label: 'Project loading',
        description: 'Local board and project archive loading helpers.'
    },
    geometry_metadata: {
        label: 'Geometry and metadata',
        description:
            'S-expression, layer, net, and geometry normalization helpers.'
    },
    rendering: {
        label: 'Rendering',
        description: 'Deterministic SVG and HTML renderer output.'
    },
    scene3d: {
        label: '3D scene data',
        description: 'Data-only PCB 3D scene-description helpers.'
    },
    reporting: {
        label: 'Reporting',
        description:
            'Read-only diagnostics, report normalization, and readiness summaries.'
    }
})

const safetyClasses = Object.freeze(['read_only'])

const capabilities = Object.freeze([
    capability({
        id: 'kicad_pcb_parser',
        label: 'PCB parser',
        category: 'parser',
        outputs: ['kicadBoard', 'Circuit JSON'],
        summary: 'Parses native .kicad_pcb S-expression board data.'
    }),
    capability({
        id: 'kicad_schematic_parser',
        label: 'Schematic parser',
        category: 'parser',
        outputs: ['schematic', 'Circuit JSON'],
        summary: 'Parses native .kicad_sch S-expression schematic data.'
    }),
    capability({
        id: 'circuit_json_adapter',
        label: 'Circuit JSON adapter',
        category: 'parser',
        outputs: ['Circuit JSON', 'renderer model'],
        summary:
            'Converts between renderer compatibility models and Circuit JSON arrays.'
    }),
    capability({
        id: 'project_zip_loader',
        label: 'Project ZIP loader',
        category: 'project_loading',
        requires: ['fflate'],
        outputs: ['documents', 'assets', 'diagnostics'],
        summary: 'Loads local KiCad project archives and companion assets.'
    }),
    capability({
        id: 's_expression_parser',
        label: 'S-expression parser',
        category: 'geometry_metadata',
        outputs: ['AST'],
        summary: 'Tokenizes and parses KiCad-style S-expression documents.'
    }),
    capability({
        id: 'layer_metadata',
        label: 'Layer metadata',
        category: 'geometry_metadata',
        outputs: ['layer records'],
        summary:
            'Normalizes KiCad layer aliases, ordinals, sides, classes, and wildcards.'
    }),
    capability({
        id: 'net_resolution',
        label: 'Net resolution',
        category: 'geometry_metadata',
        outputs: ['net records'],
        summary: 'Resolves KiCad net codes and names onto parsed primitives.'
    }),
    capability({
        id: 'geometry_helpers',
        label: 'Geometry helpers',
        category: 'geometry_metadata',
        outputs: ['bounds', 'clearances'],
        summary:
            'Computes board-coordinate primitive bounds and supported shape clearances.'
    }),
    capability({
        id: 'pcb_svg_renderer',
        label: 'PCB SVG renderer',
        category: 'rendering',
        outputs: ['SVG'],
        summary:
            'Renders deterministic PCB SVG markup from recovered board models.'
    }),
    capability({
        id: 'schematic_svg_renderer',
        label: 'Schematic SVG renderer',
        category: 'rendering',
        outputs: ['SVG'],
        summary:
            'Renders deterministic schematic SVG markup from recovered sheet models.'
    }),
    capability({
        id: 'bom_table_renderer',
        label: 'BOM table renderer',
        category: 'rendering',
        outputs: ['HTML'],
        summary: 'Renders deterministic grouped BOM table markup.'
    }),
    capability({
        id: 'pcb_scene3d_description',
        label: 'PCB 3D scene description',
        category: 'scene3d',
        outputs: ['scene data'],
        summary: 'Builds host-renderer-neutral PCB 3D scene-description data.'
    }),
    capability({
        id: 'kicad_report_normalization',
        label: 'Report normalization',
        category: 'reporting',
        outputs: ['issues', 'summary'],
        summary:
            'Normalizes caller-supplied ERC and DRC report data into issue summaries.'
    }),
    capability({
        id: 'kicad_readiness_report',
        label: 'Readiness report',
        category: 'reporting',
        outputs: ['summary', 'findings'],
        summary:
            'Summarizes parsed board readiness using recovered model data only.'
    })
])

/**
 * Builds parser and renderer capability inventories.
 */
export class KicadToolkitCapabilities {
    /**
     * Returns a filterable capability inventory.
     * @param {{ category?: string, safety?: string, includeCapabilities?: boolean }} [options] Inventory options.
     * @returns {object}
     */
    static inventory(options = {}) {
        const category = options.category || null
        const safety = options.safety || null
        if (category !== null && !Object.hasOwn(categoryInfo, category)) {
            throw new Error('Unknown capability category: ' + category)
        }
        if (safety !== null && !safetyClasses.includes(safety)) {
            throw new Error('Unknown capability safety class: ' + safety)
        }

        const records = capabilities.filter((record) => {
            return (
                (category === null || record.category === category) &&
                (safety === null || record.safety === safety)
            )
        })

        const response = {
            total: records.length,
            filters: { category, safety },
            availableCategories: Object.entries(categoryInfo).map(
                ([id, info]) => ({ id, ...info })
            ),
            categories: categoryCounts(records),
            safetyCounts: countBy(records, 'safety'),
            dependencyCounts: dependencyCounts(records),
            dryRunCounts: supportCounts(records, 'supportsDryRun', 'supported'),
            backupCounts: supportCounts(
                records,
                'createsBackup',
                'creates_backup'
            )
        }

        if (options.includeCapabilities !== false) {
            response.capabilities = records.map((record) => ({ ...record }))
        }

        return response
    }
}

/**
 * Builds a capability record with library defaults.
 * @param {object} record Capability fields.
 * @returns {object}
 */
function capability(record) {
    return Object.freeze({
        id: record.id,
        label: record.label,
        category: record.category,
        safety: 'read_only',
        requires: record.requires || [],
        outputs: record.outputs || [],
        supportsBrowser: record.supportsBrowser !== false,
        supportsNode: record.supportsNode !== false,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary: record.summary
    })
}

/**
 * Counts capabilities by category and attaches category metadata.
 * @param {object[]} records Capability records.
 * @returns {Record<string, object>}
 */
function categoryCounts(records) {
    const counts = countBy(records, 'category')
    return Object.fromEntries(
        Object.entries(categoryInfo)
            .filter(([id]) => counts[id])
            .map(([id, info]) => [id, { ...info, count: counts[id] }])
    )
}

/**
 * Counts records by one property.
 * @param {object[]} records Records.
 * @param {string} key Property name.
 * @returns {Record<string, number>}
 */
function countBy(records, key) {
    const counts = {}
    for (const record of records) {
        const value = String(record[key] || '')
        counts[value] = (counts[value] || 0) + 1
    }
    return Object.fromEntries(Object.entries(counts).sort())
}

/**
 * Counts dependency labels.
 * @param {object[]} records Capability records.
 * @returns {Record<string, number>}
 */
function dependencyCounts(records) {
    const counts = {}
    for (const record of records) {
        const dependencies = record.requires.length ? record.requires : ['none']
        for (const dependency of dependencies) {
            counts[dependency] = (counts[dependency] || 0) + 1
        }
    }
    return Object.fromEntries(Object.entries(counts).sort())
}

/**
 * Counts boolean support flags.
 * @param {object[]} records Capability records.
 * @param {string} key Flag key.
 * @param {string} supportedKey Output key for supported count.
 * @returns {{ [key: string]: number }}
 */
function supportCounts(records, key, supportedKey) {
    const supported = records.filter((record) => record[key] === true).length
    return {
        [supportedKey]: supported,
        unsupported: records.length - supported
    }
}
