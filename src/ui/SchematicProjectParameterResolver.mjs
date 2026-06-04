// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Resolves KiCad schematic project parameters for render-time views.
 */
export class SchematicProjectParameterResolver {
    /**
     * Resolves KiCad project parameters without mutating the source schematic.
     * @param {object | undefined} schematic Schematic model.
     * @param {Record<string, unknown> | undefined} projectParameters Parameters.
     * @returns {object | undefined}
     */
    static resolveSchematic(schematic, projectParameters) {
        if (!schematic || !projectParameters) return schematic
        const sheet = schematic.sheet || {}
        const titleBlock = sheet.titleBlock || {}
        const comments = resolveTitleBlockComments(
            titleBlock.comments,
            projectParameters
        )
        const resolvedTexts = (schematic.texts || []).map((text) =>
            resolveTextPrimitiveParameters(text, projectParameters)
        )

        return {
            ...schematic,
            sheet: {
                ...sheet,
                titleBlock: {
                    ...titleBlock,
                    title: expandTextVariables(
                        titleBlock.title,
                        projectParameters
                    ),
                    documentNumber: expandTextVariables(
                        titleBlock.documentNumber,
                        projectParameters
                    ),
                    revision: expandTextVariables(
                        titleBlock.revision,
                        projectParameters
                    ),
                    date: expandTextVariables(
                        titleBlock.date,
                        projectParameters
                    ),
                    comments
                }
            },
            texts: resolvedTexts
        }
    }
}

/**
 * Resolves title block comment text variables.
 * @param {object | undefined} comments Comment map.
 * @param {Record<string, unknown>} projectParameters Parameters.
 * @returns {object}
 */
function resolveTitleBlockComments(comments, projectParameters) {
    return Object.fromEntries(
        Object.entries(comments || {}).map(([key, value]) => [
            key,
            expandTextVariables(value, projectParameters)
        ])
    )
}

/**
 * Resolves render-time project parameters for one schematic text primitive.
 * @param {object} text Text primitive.
 * @param {Record<string, unknown>} projectParameters Parameters.
 * @returns {object}
 */
function resolveTextPrimitiveParameters(text, projectParameters) {
    const resolvedText = expandOptionalTextVariables(
        text.text,
        projectParameters
    )
    const resolvedValue = expandOptionalTextVariables(
        text.value,
        projectParameters
    )

    if (resolvedText === text.text && resolvedValue === text.value) {
        return text
    }

    return {
        ...text,
        text: resolvedText,
        value: resolvedValue
    }
}

/**
 * Expands KiCad-style text variables while preserving absent properties.
 * @param {unknown} value Text value.
 * @param {Record<string, unknown>} projectParameters Parameters.
 * @returns {string | undefined}
 */
function expandOptionalTextVariables(value, projectParameters) {
    if (value === undefined || value === null) return undefined
    return expandTextVariables(value, projectParameters)
}

/**
 * Expands KiCad-style ${name} text variables.
 * @param {unknown} value Text value.
 * @param {Record<string, unknown>} projectParameters Parameters.
 * @returns {string}
 */
function expandTextVariables(value, projectParameters) {
    if (value === undefined || value === null) return ''
    return String(value).replace(/\$\{([^}]+)\}/gu, (match, name) => {
        const key = String(name || '').trim()
        if (!Object.hasOwn(projectParameters, key)) return match
        return String(projectParameters[key] ?? '')
    })
}
