// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schemaId = 'kicad-toolkit.schematic.qa.a1'

/**
 * Builds deterministic document-level QA summaries for KiCad schematics.
 */
export class KicadSchematicQaReportBuilder {
    /**
     * Builds a schematic QA report from a normalized schematic model.
     * @param {{ schematic?: object, projectParameters?: Record<string, unknown> } | object} input QA input.
     * @returns {object}
     */
    static build(input = {}) {
        const schematic = input.schematic || input
        const projectParameters = input.projectParameters || {}
        const texts = Array.isArray(schematic.texts) ? schematic.texts : []
        const titleBlock = schematic.sheet?.titleBlock || {}
        const unresolvedParameters = unresolvedParametersFor(
            schematic,
            projectParameters
        )
        const titleBlockGaps = titleBlockGapsFor(titleBlock)
        const fonts = fontsFor(texts)
        const lineWidths = lineWidthsFor(schematic)
        const findings = [
            ...unresolvedParameters.map((parameter) => ({
                code: 'schematic.text.unresolved-parameter',
                severity: 'warning',
                parameter,
                message:
                    'Schematic text contains an unresolved project parameter.'
            })),
            ...titleBlockGaps.map((gap) => ({
                code: 'schematic.title-block.missing-field',
                severity: 'info',
                field: gap.field,
                message: 'Schematic title block field is empty.'
            }))
        ]

        return {
            schema: schemaId,
            summary: {
                textCount: texts.length,
                fontFamilyCount: fonts.families.length,
                lineWidthCount: lineWidths.values.length,
                unresolvedParameterCount: unresolvedParameters.length,
                titleBlockGapCount: titleBlockGaps.length,
                findingCount: findings.length
            },
            fonts,
            lineWidths,
            unresolvedParameters,
            titleBlockGaps,
            findings
        }
    }
}

/**
 * Finds unresolved KiCad `${name}` project parameters.
 * @param {object} schematic Schematic model.
 * @param {Record<string, unknown>} projectParameters Project parameters.
 * @returns {string[]}
 */
function unresolvedParametersFor(schematic, projectParameters) {
    const values = [
        ...textValues(schematic.sheet?.titleBlock),
        ...(schematic.texts || []).flatMap((text) =>
            textValues({
                text: text.text,
                value: text.value
            })
        )
    ]
    const unresolved = new Set()

    for (const value of values) {
        for (const parameter of parameterNames(value)) {
            if (Object.hasOwn(projectParameters, parameter)) continue
            unresolved.add(parameter)
        }
    }

    return [...unresolved].sort()
}

/**
 * Extracts text-bearing title-block values.
 * @param {object | undefined} value Value object.
 * @returns {string[]}
 */
function textValues(value) {
    if (!value) return []
    return [
        value.text,
        value.value,
        value.title,
        value.documentNumber,
        value.revision,
        value.date,
        ...Object.values(value.comments || {})
    ]
        .filter((entry) => entry !== undefined && entry !== null)
        .map(String)
}

/**
 * Extracts KiCad text variable names from one value.
 * @param {string} value Text value.
 * @returns {string[]}
 */
function parameterNames(value) {
    return [...String(value || '').matchAll(/\$\{([^}]+)\}/gu)]
        .map((match) => String(match[1] || '').trim())
        .filter(Boolean)
}

/**
 * Finds title-block fields that are present in KiCad but empty.
 * @param {object} titleBlock Title block model.
 * @returns {{ field: string }[]}
 */
function titleBlockGapsFor(titleBlock) {
    return ['title', 'documentNumber', 'revision', 'date']
        .filter((field) => {
            if (!Object.hasOwn(titleBlock, field)) return false
            return !String(titleBlock[field] ?? '').trim()
        })
        .map((field) => ({ field }))
}

/**
 * Summarizes font families used by schematic text rows.
 * @param {object[]} texts Text rows.
 * @returns {{ families: string[], entries: object[] }}
 */
function fontsFor(texts) {
    const entries = (texts || [])
        .map((text, index) => ({
            index,
            family: String(
                text.fontFamily || text.fontFace || text.fontName || ''
            ).trim()
        }))
        .filter((entry) => entry.family)
        .sort((left, right) => left.family.localeCompare(right.family))

    return {
        families: [...new Set(entries.map((entry) => entry.family))],
        entries
    }
}

/**
 * Summarizes authored line widths.
 * @param {object} schematic Schematic model.
 * @returns {{ values: number[], entries: object[] }}
 */
function lineWidthsFor(schematic) {
    const entries = [
        ...(schematic.texts || []),
        ...(schematic.drawings || []),
        ...(schematic.lines || [])
    ]
        .map((item, index) => ({
            index,
            width: numericWidth(item)
        }))
        .filter((entry) => entry.width !== null)

    return {
        values: [...new Set(entries.map((entry) => entry.width))].sort(
            (left, right) => left - right
        ),
        entries
    }
}

/**
 * Resolves a finite line width from a schematic primitive.
 * @param {object} item Schematic primitive.
 * @returns {number | null}
 */
function numericWidth(item) {
    const value = Number(item?.strokeWidth ?? item?.width ?? item?.lineWidth)
    return Number.isFinite(value) ? value : null
}
