// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schemaId = 'kicad-toolkit.pcb.rule-read-model.a1'
const milsPerMillimeter = 1000 / 25.4

const ruleTypeByName = Object.freeze({
    clearance: ruleType('clearance', 'electrical', 'Clearance'),
    minimum_clearance: ruleType('clearance', 'electrical', 'Clearance'),
    track_width: ruleType('width', 'routing', 'Track Width'),
    width: ruleType('width', 'routing', 'Track Width'),
    via: ruleType('routing-vias', 'routing', 'Routing Vias'),
    vias: ruleType('routing-vias', 'routing', 'Routing Vias'),
    via_dimensions: ruleType('routing-vias', 'routing', 'Routing Vias'),
    allow_blind_buried_vias: ruleType(
        'routing-vias',
        'routing',
        'Routing Vias'
    ),
    diff_pair_dimensions: ruleType(
        'differential-pair-routing',
        'routing',
        'Differential Pair Routing'
    ),
    differential_pair: ruleType(
        'differential-pair-routing',
        'routing',
        'Differential Pair Routing'
    ),
    length: ruleType('length', 'routing', 'Length'),
    hole_clearance: ruleType(
        'minimum-annular-ring',
        'manufacturing',
        'Hole Clearance'
    )
})

/**
 * Builds typed KiCad PCB rule read models from custom rules and project defaults.
 */
export class KicadPcbRuleReadModelBuilder {
    /**
     * Builds a deterministic rule report.
     * @param {{ designRules?: object, projectModel?: object }} [input] Rule context.
     * @returns {object}
     */
    static build(input = {}) {
        const designRules = resolveDesignRules(input)
        const projectModel = resolveProjectModel(input)
        const customRules = customRuleRows(designRules)
        const projectRules = projectRuleRows(projectModel)
        const rules = [...customRules, ...projectRules]
        const componentClassAssignments = componentClassRows(designRules)
        const netClasses = netClassRows(projectModel)
        const diagnostics = diagnosticsFor(rules)

        return {
            schema: schemaId,
            units: { distance: 'mm', distanceAlternate: 'mil' },
            summary: {
                ruleCount: rules.length,
                customRuleCount: customRules.length,
                projectRuleCount: projectRules.length,
                netClassCount: netClasses.length,
                componentClassAssignmentCount: componentClassAssignments.length,
                constraintCount: rules.reduce(
                    (total, row) => total + row.constraints.length,
                    0
                ),
                diagnosticCount: diagnostics.length
            },
            rules,
            componentClassAssignments,
            netClasses,
            diagnostics,
            indexes: {
                ruleKeysByKind: keysBy(rules, 'ruleType.kind'),
                ruleKeysBySource: keysBy(rules, 'source'),
                rulesByName: indexBy(rules, 'name')
            }
        }
    }
}

/**
 * Resolves the parsed custom-rule model.
 * @param {object} input Build input.
 * @returns {object}
 */
function resolveDesignRules(input) {
    if (input?.kind === 'design-rules') return input
    return input?.designRules || input?.designRuleModel || {}
}

/**
 * Resolves the parsed project model.
 * @param {object} input Build input.
 * @returns {object}
 */
function resolveProjectModel(input) {
    if (input?.kind === 'project-metadata') return input
    return input?.projectModel || input?.project || {}
}

/**
 * Builds custom .kicad_dru rule rows.
 * @param {object} designRules Parsed design-rules model.
 * @returns {object[]}
 */
function customRuleRows(designRules) {
    return (designRules?.rules || []).map((rule, index) => {
        const constraints = (rule.constraints || []).map((constraint) =>
            constraintRow(constraint.name, constraint.values || {})
        )
        const firstType = constraints[0]?.ruleType || ruleTypeFor(rule.name)

        return stripUndefined({
            key: 'custom-rule-' + index,
            source: 'kicad_dru',
            sourceFileName: String(designRules?.fileName || ''),
            name: String(rule.name || ''),
            condition: String(rule.condition || ''),
            layer: String(rule.layer || ''),
            severity: String(rule.severity || ''),
            ruleType: firstType,
            constraints,
            disallow: rule.disallow || []
        })
    })
}

/**
 * Builds project-default rule rows.
 * @param {object} projectModel Parsed project model.
 * @returns {object[]}
 */
function projectRuleRows(projectModel) {
    const settings = projectModel?.board?.designSettings || {}
    return [
        ...projectSettingRules(projectModel, settings.rules || []),
        aggregateArrayRule(
            projectModel,
            'track-widths',
            'track_width',
            settings.trackWidths || []
        ),
        aggregateArrayRule(
            projectModel,
            'via-dimensions',
            'via_dimensions',
            settings.viaDimensions || []
        ),
        aggregateArrayRule(
            projectModel,
            'diff-pair-dimensions',
            'diff_pair_dimensions',
            settings.diffPairDimensions || []
        )
    ].filter(Boolean)
}

/**
 * Builds keyed project setting rules.
 * @param {object} projectModel Parsed project model.
 * @param {object[]} rules Project setting rows.
 * @returns {object[]}
 */
function projectSettingRules(projectModel, rules) {
    return (rules || []).map((row) => {
        const name = String(row.name || '')
        return projectRule(projectModel, name, [
            constraintRow(name, { value: row.value })
        ])
    })
}

/**
 * Builds one aggregate rule from project array defaults.
 * @param {object} projectModel Parsed project model.
 * @param {string} slugName Rule slug.
 * @param {string} constraintName Constraint name.
 * @param {unknown[]} entries Source entries.
 * @returns {object | null}
 */
function aggregateArrayRule(projectModel, slugName, constraintName, entries) {
    if (!Array.isArray(entries) || entries.length === 0) return null

    return projectRule(
        projectModel,
        slugName.replace(/-/g, '_'),
        entries.map((entry, index) =>
            constraintRow(constraintName, valueFieldsFor(entry, index))
        )
    )
}

/**
 * Builds one project rule row.
 * @param {object} projectModel Parsed project model.
 * @param {string} name Rule name.
 * @param {object[]} constraints Constraint rows.
 * @returns {object}
 */
function projectRule(projectModel, name, constraints) {
    const firstType = constraints[0]?.ruleType || ruleTypeFor(name)
    return {
        key: 'project-rule-' + slug(name),
        source: 'kicad_pro',
        sourceFileName: String(projectModel?.fileName || ''),
        name,
        ruleType: firstType,
        constraints
    }
}

/**
 * Builds fields for one aggregate value.
 * @param {unknown} value Source value.
 * @param {number} index Source index.
 * @returns {object}
 */
function valueFieldsFor(value, index) {
    if (typeof value === 'object' && value !== null) {
        return { index, ...value }
    }
    return { index, value }
}

/**
 * Builds one normalized constraint row.
 * @param {string} name Constraint name.
 * @param {Record<string, unknown>} values Constraint values.
 * @returns {object}
 */
function constraintRow(name, values) {
    const ruleTypeValue = ruleTypeFor(name)
    const normalizedValues = Object.fromEntries(
        Object.entries(values || {}).map(([key, value]) => [
            key,
            typedValue(value)
        ])
    )

    return {
        name: String(name || ''),
        ruleType: ruleTypeValue,
        values: normalizedValues,
        typed: typedConstraintValues(ruleTypeValue.kind, normalizedValues)
    }
}

/**
 * Builds typed aliases for common rule families.
 * @param {string} kind Rule kind.
 * @param {Record<string, object>} values Normalized values.
 * @returns {object}
 */
function typedConstraintValues(kind, values) {
    if (kind === 'width') {
        return stripUndefined({
            minWidthMm: values.min?.valueMm,
            preferredWidthMm: (values.opt || values.preferred)?.valueMm,
            maxWidthMm: values.max?.valueMm,
            minWidthMil: values.min?.valueMil,
            preferredWidthMil: (values.opt || values.preferred)?.valueMil,
            maxWidthMil: values.max?.valueMil
        })
    }
    if (kind === 'clearance') {
        return stripUndefined({
            minClearanceMm: (values.min || values.value)?.valueMm,
            minClearanceMil: (values.min || values.value)?.valueMil
        })
    }
    if (kind === 'routing-vias') {
        return stripUndefined({
            viaDiameterMm: (values.diameter || values.value)?.valueMm,
            viaDrillMm: values.drill?.valueMm
        })
    }
    if (kind === 'differential-pair-routing') {
        return stripUndefined({
            widthMm: values.width?.valueMm,
            gapMm: values.gap?.valueMm
        })
    }
    return {}
}

/**
 * Normalizes one scalar value with optional distance units.
 * @param {unknown} value Raw value.
 * @returns {object}
 */
function typedValue(value) {
    const parsed = parseDistance(value)
    if (parsed) return parsed
    if (typeof value === 'boolean') {
        return { raw: value, value }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return {
            raw: value,
            value,
            unit: 'mm',
            valueMm: round(value),
            valueMil: round(value * milsPerMillimeter)
        }
    }
    return { raw: value, value: String(value ?? '') }
}

/**
 * Parses KiCad distance-like values.
 * @param {unknown} value Raw value.
 * @returns {object | null}
 */
function parseDistance(value) {
    const text = String(value ?? '').trim()
    const match = text.match(
        /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(mm|mil|in)?$/iu
    )
    if (!match) return null
    const numeric = Number(match[1])
    if (!Number.isFinite(numeric)) return null
    const unit = (match[2] || 'mm').toLowerCase()
    const valueMm =
        unit === 'mil'
            ? numeric / milsPerMillimeter
            : unit === 'in'
              ? numeric * 25.4
              : numeric
    return {
        raw: value,
        value: numeric,
        unit,
        valueMm: round(valueMm),
        valueMil: round(valueMm * milsPerMillimeter)
    }
}

/**
 * Builds component-class assignment rows.
 * @param {object} designRules Parsed design-rules model.
 * @returns {object[]}
 */
function componentClassRows(designRules) {
    return (designRules?.componentClassAssignments || []).map(
        (assignment, index) =>
            stripUndefined({
                key: 'component-class-' + index,
                name: String(assignment.name || ''),
                condition: String(assignment.condition || ''),
                sourceFileName: String(designRules?.fileName || '')
            })
    )
}

/**
 * Builds net-class lookup rows.
 * @param {object} projectModel Parsed project model.
 * @returns {object[]}
 */
function netClassRows(projectModel) {
    return (projectModel?.netSettings?.classes || []).map((entry) => {
        const name = String(entry.name || '')
        return {
            name,
            nets: entry.nets || [],
            ruleKeys: [
                'net-class-' + name + '-clearance',
                'net-class-' + name + '-track-width',
                'net-class-' + name + '-via'
            ],
            constraints: {
                clearance: typedValue(entry.clearance),
                trackWidth: typedValue(entry.trackWidth),
                viaDiameter: typedValue(entry.viaDiameter),
                viaDrill: typedValue(entry.viaDrill)
            }
        }
    })
}

/**
 * Builds diagnostics for unsupported rules.
 * @param {object[]} rules Rule rows.
 * @returns {object[]}
 */
function diagnosticsFor(rules) {
    return (rules || [])
        .filter((row) => row.ruleType.kind === 'unsupported')
        .map((row) => ({
            code: 'kicad.pcb.rule.unsupported-kind',
            severity: 'info',
            ruleKey: row.key,
            message: 'KiCad PCB rule kind is preserved without typed aliases.'
        }))
}

/**
 * Resolves a rule type descriptor.
 * @param {string} name Rule or constraint name.
 * @returns {object}
 */
function ruleTypeFor(name) {
    const normalized = String(name || '')
        .toLowerCase()
        .replace(/[-\s]+/gu, '_')
    return (
        ruleTypeByName[normalized] ||
        ruleType('unsupported', 'unsupported', 'Unsupported')
    )
}

/**
 * Builds a rule type descriptor.
 * @param {string} kind Stable kind.
 * @param {string} category Stable category.
 * @param {string} displayName Human display label.
 * @returns {object}
 */
function ruleType(kind, category, displayName) {
    return { kind, category, displayName }
}

/**
 * Builds a field index by row key.
 * @param {object[]} rows Rows to index.
 * @param {string} field Field name.
 * @returns {Record<string, string[]>}
 */
function keysBy(rows, field) {
    const groups = {}
    for (const row of rows || []) {
        const key = valueAtPath(row, field)
        if (!key) continue
        groups[key] ||= []
        groups[key].push(row.key)
    }
    return Object.fromEntries(Object.entries(groups).sort())
}

/**
 * Builds an index by a row field.
 * @param {object[]} rows Rows to index.
 * @param {string} field Field name.
 * @returns {Record<string, number>}
 */
function indexBy(rows, field) {
    return Object.fromEntries(
        (rows || [])
            .map((row, index) => [String(row[field] || ''), index])
            .filter(([key]) => key)
            .sort(([left], [right]) => left.localeCompare(right))
    )
}

/**
 * Reads a dotted path from an object.
 * @param {object} value Source object.
 * @param {string} path Dotted path.
 * @returns {string}
 */
function valueAtPath(value, path) {
    return String(
        path.split('.').reduce((current, part) => current?.[part], value) || ''
    )
}

/**
 * Builds a slug token.
 * @param {string} value Source value.
 * @returns {string}
 */
function slug(value) {
    return (
        String(value || '')
            .trim()
            .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
            .replace(/[^a-zA-Z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .toLowerCase() || 'unnamed'
    )
}

/**
 * Rounds deterministic numeric fields.
 * @param {unknown} value Candidate value.
 * @returns {number | undefined}
 */
function round(value) {
    const number = Number(value)
    if (!Number.isFinite(number)) return undefined
    return Number(number.toFixed(6))
}

/**
 * Removes undefined values from an object.
 * @param {Record<string, unknown>} value Source value.
 * @returns {object}
 */
function stripUndefined(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(([, entry]) => entry !== undefined)
    )
}
