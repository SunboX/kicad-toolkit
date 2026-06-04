// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'

/**
 * Parses KiCad .kicad_pro JSON metadata into a deterministic model.
 */
export class KicadProjectMetadataParser {
    /**
     * Parses a KiCad project JSON file.
     * @param {string} source Project source text.
     * @param {{ fileName?: string }} [options] Parser options.
     * @returns {object}
     */
    static parse(source, options = {}) {
        const rawProject = JSON.parse(String(source || '{}'))
        const fileName = String(
            options.fileName || rawProject.meta?.filename || ''
        )
        const boards = arrayOf(rawProject.boards)
        const sheets = arrayOf(rawProject.sheets)
        const topLevelSheets = arrayOf(rawProject.schematic?.top_level_sheets)
        const netClasses = normalizeNetClasses(
            rawProject.net_settings?.classes || []
        )
        const designSettings = normalizeDesignSettings(
            rawProject.board?.design_settings || {}
        )
        const textVariables = rawProject.text_variables || {}

        return NormalizedModelSchema.attach({
            sourceFormat: 'kicad',
            kind: 'project-metadata',
            fileType: 'kicad_pro',
            fileName,
            summary: {
                title:
                    stripKnownExtension(baseName(fileName)) || 'kicad-project',
                boardCount: boards.length,
                sheetCount: sheets.length,
                topLevelSheetCount: topLevelSheets.length,
                netClassCount: netClasses.length,
                ruleCount: designSettings.rules.length,
                textVariableCount: Object.keys(textVariables).length
            },
            diagnostics: [],
            meta: rawProject.meta || {},
            boards,
            sheets,
            topLevelSheets,
            textVariables,
            libraries: rawProject.libraries || {},
            board: { designSettings },
            netSettings: {
                meta: rawProject.net_settings?.meta || {},
                classes: netClasses
            },
            bom: [],
            rawProject
        })
    }
}

/**
 * Normalizes KiCad net class records.
 * @param {object[]} classes Raw class rows.
 * @returns {object[]}
 */
function normalizeNetClasses(classes) {
    return arrayOf(classes).map((entry) =>
        removeUndefinedValues({
            name: String(entry?.name || ''),
            clearance: entry?.clearance,
            trackWidth: entry?.track_width,
            viaDiameter: entry?.via_diameter,
            viaDrill: entry?.via_drill,
            nets: arrayOf(entry?.nets)
        })
    )
}

/**
 * Normalizes board design settings.
 * @param {object} settings Raw design settings.
 * @returns {object}
 */
function normalizeDesignSettings(settings) {
    return {
        defaults: settings.defaults || {},
        diffPairDimensions: arrayOf(settings.diff_pair_dimensions),
        drcExclusions: arrayOf(settings.drc_exclusions),
        rules: normalizeRules(settings.rules || {}),
        trackWidths: arrayOf(settings.track_widths),
        viaDimensions: arrayOf(settings.via_dimensions)
    }
}

/**
 * Normalizes object keyed rules to sorted rows.
 * @param {Record<string, unknown>} rules Raw rules.
 * @returns {object[]}
 */
function normalizeRules(rules) {
    return Object.entries(rules || {})
        .map(([name, value]) => ({ name, value }))
        .sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * Returns an array or an empty fallback.
 * @param {unknown} value Raw value.
 * @returns {unknown[]}
 */
function arrayOf(value) {
    return Array.isArray(value) ? value : []
}

/**
 * Removes undefined fields from an object.
 * @param {Record<string, unknown>} value Source object.
 * @returns {object}
 */
function removeUndefinedValues(value) {
    return Object.fromEntries(
        Object.entries(value).filter((entry) => entry[1] !== undefined)
    )
}

/**
 * Returns a path basename.
 * @param {string} path File path.
 * @returns {string}
 */
function baseName(path) {
    return (
        String(path || '')
            .replace(/\\/g, '/')
            .split('/')
            .pop() || ''
    )
}

/**
 * Strips a known KiCad extension.
 * @param {string} fileName File name.
 * @returns {string}
 */
function stripKnownExtension(fileName) {
    return String(fileName || '').replace(/\.kicad_pro$/i, '')
}
