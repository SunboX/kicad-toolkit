// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schemaId = 'kicad-toolkit.library.qa.a1'
const mergePlanSchemaId = 'kicad-toolkit.library.merge-plan.a1'

/**
 * Builds deterministic QA reports across parsed KiCad library collections.
 */
export class KicadLibraryQaReportBuilder {
    /**
     * Builds a library QA report.
     * @param {{ schematicLibraries?: object[], pcbLibraries?: object[], libraryIndex?: object, availableAssets?: string[] }} [options] Library collections.
     * @returns {object}
     */
    static build(options = {}) {
        const schematicLibraries = options.schematicLibraries || []
        const pcbLibraries = options.pcbLibraries || []
        const symbols = symbolRows(schematicLibraries, options.libraryIndex)
        const footprints = footprintRows(pcbLibraries, options.libraryIndex)
        const duplicateSymbols = duplicatesByName(symbols, 'symbol')
        const duplicateFootprints = duplicateFootprintsFor(footprints)
        const unresolvedFootprintReferences = unresolvedFootprintReferencesFor(
            symbols,
            footprints
        )
        const missingModels = missingModelsFor(
            footprints,
            new Set(options.availableAssets || [])
        )
        const unitMismatches = unitMismatchesFor(symbols)
        const mergePlan = schematicLibraryMergePlan(schematicLibraries)
        const issues = [
            ...duplicateSymbols.map((entry) =>
                issue('library.duplicate-symbol', entry.name)
            ),
            ...mergePlan.diagnostics.map((diagnostic) =>
                issue(diagnostic.code, diagnostic.symbolName)
            ),
            ...duplicateFootprints.map((entry) =>
                issue('library.duplicate-footprint', entry.name)
            ),
            ...unresolvedFootprintReferences.map((entry) =>
                issue(
                    'library.unresolved-footprint-reference',
                    entry.symbolName
                )
            ),
            ...missingModels.map((entry) =>
                issue('library.missing-model', entry.footprintName)
            ),
            ...unitMismatches.map((entry) =>
                issue('library.unit-mismatch', entry.symbolName)
            )
        ]

        return {
            schema: schemaId,
            summary: {
                schematicLibraryCount: schematicLibraries.length,
                pcbLibraryCount: pcbLibraries.length,
                duplicateSymbolCount: duplicateSymbols.length,
                mergePlanConflictCount: mergePlan.summary.conflictCount,
                duplicateFootprintCount: duplicateFootprints.length,
                unresolvedFootprintReferenceCount:
                    unresolvedFootprintReferences.length,
                missingModelCount: missingModels.length,
                unitMismatchCount: unitMismatches.length,
                issueCount: issues.length
            },
            duplicates: {
                symbols: duplicateSymbols,
                footprints: duplicateFootprints
            },
            mergePlan,
            unresolvedFootprintReferences,
            missingModels,
            unitMismatches,
            issues
        }
    }
}

/**
 * Builds a read-only merge plan for parsed KiCad schematic libraries.
 * @param {object[]} schematicLibraries Parsed schematic library wrappers.
 * @returns {object}
 */
function schematicLibraryMergePlan(schematicLibraries) {
    const duplicateSymbols = mergePlanDuplicateSymbols(schematicLibraries)
    const embeddedAssets = mergePlanEmbeddedAssets(schematicLibraries)
    const fontDependencies = mergePlanFontDependencies(schematicLibraries)
    const diagnostics = duplicateSymbols
        .filter((duplicate) => duplicate.conflictKind === 'conflicting-symbol')
        .map((duplicate) => ({
            code: 'library.merge-plan.conflicting-symbol',
            severity: 'warning',
            symbolName: duplicate.name
        }))

    return {
        schema: mergePlanSchemaId,
        strategy: 'read-only-analysis',
        summary: {
            duplicateNameCount: duplicateSymbols.length,
            conflictCount: diagnostics.length,
            renameSuggestionCount: duplicateSymbols.reduce(
                (count, duplicate) =>
                    count +
                    duplicate.suggestedNames.filter(
                        (suggestion) =>
                            suggestion.currentName !== suggestion.suggestedName
                    ).length,
                0
            ),
            embeddedAssetCount: embeddedAssets.length,
            fontDependencyCount: fontDependencies.length
        },
        duplicateSymbols,
        embeddedAssets,
        fontDependencies,
        diagnostics
    }
}

/**
 * Builds duplicate-symbol merge plan entries.
 * @param {object[]} schematicLibraries Parsed schematic library wrappers.
 * @returns {object[]}
 */
function mergePlanDuplicateSymbols(schematicLibraries) {
    const byName = new Map()

    for (const library of schematicLibraries || []) {
        for (const [index, symbol] of (
            library.schematicLibrary?.symbols || []
        ).entries()) {
            const name = String(symbol?.name || '').trim()
            if (!name) continue
            byName.set(name, [
                ...(byName.get(name) || []),
                {
                    name,
                    symbol,
                    ...mergePlanSymbolOccurrence(
                        library.fileName || '',
                        index,
                        symbol
                    )
                }
            ])
        }
    }

    return [...byName.entries()]
        .filter(([, occurrences]) => occurrences.length > 1)
        .map(([name, occurrences]) => {
            const differences = mergePlanDifferences(occurrences)
            return {
                name,
                conflictKind:
                    Object.keys(differences).length > 0
                        ? 'conflicting-symbol'
                        : 'duplicate-name',
                suggestedNames: mergePlanSuggestedNames(name, occurrences),
                differences,
                occurrences: occurrences.map(
                    ({
                        libraryFileName,
                        index,
                        pinCount,
                        unitCount,
                        graphicCount
                    }) => ({
                        libraryFileName,
                        index,
                        pinCount,
                        unitCount,
                        graphicCount
                    })
                )
            }
        })
        .sort(compareNamed)
}

/**
 * Builds one merge-plan occurrence row for a schematic symbol.
 * @param {string} fileName Source library file name.
 * @param {number} index Symbol index in the library.
 * @param {object} symbol Parsed symbol.
 * @returns {object}
 */
function mergePlanSymbolOccurrence(fileName, index, symbol) {
    return {
        libraryFileName: fileName || '',
        index,
        pinCount: (symbol?.pins || []).length,
        unitCount: (symbol?.units || []).length,
        graphicCount: graphicCount(symbol)
    }
}

/**
 * Builds differing count dimensions for duplicate symbols.
 * @param {object[]} occurrences Duplicate symbol occurrences.
 * @returns {object}
 */
function mergePlanDifferences(occurrences) {
    return {
        ...mergePlanDifference(
            'pinCounts',
            occurrences.map((occurrence) => occurrence.pinCount)
        ),
        ...mergePlanDifference(
            'unitCounts',
            occurrences.map((occurrence) => occurrence.unitCount)
        ),
        ...mergePlanDifference(
            'graphicCounts',
            occurrences.map((occurrence) => occurrence.graphicCount)
        )
    }
}

/**
 * Returns one difference field when values differ.
 * @param {string} key Difference key.
 * @param {number[]} values Count values.
 * @returns {object}
 */
function mergePlanDifference(key, values) {
    return new Set(values).size > 1 ? { [key]: values } : {}
}

/**
 * Builds deterministic duplicate-symbol rename suggestions.
 * @param {string} name Current duplicate symbol name.
 * @param {object[]} occurrences Duplicate occurrences.
 * @returns {object[]}
 */
function mergePlanSuggestedNames(name, occurrences) {
    return occurrences.map((occurrence, index) => ({
        libraryFileName: occurrence.libraryFileName,
        index: occurrence.index,
        currentName: name,
        suggestedName: index === 0 ? name : `${name}_${index + 1}`
    }))
}

/**
 * Collects embedded assets from parsed schematic libraries.
 * @param {object[]} schematicLibraries Parsed schematic library wrappers.
 * @returns {object[]}
 */
function mergePlanEmbeddedAssets(schematicLibraries) {
    const assets = []

    for (const library of schematicLibraries || []) {
        for (const symbol of library.schematicLibrary?.symbols || []) {
            for (const asset of symbol?.embeddedAssets || []) {
                assets.push(
                    stripEmpty({
                        libraryFileName: library.fileName || '',
                        symbolName: symbol.name || '',
                        key: asset?.key,
                        format: asset?.format,
                        source: asset?.source,
                        sourceStream: asset?.sourceStream
                    })
                )
            }
        }
    }

    return assets
}

/**
 * Collects font dependencies from parsed schematic libraries.
 * @param {object[]} schematicLibraries Parsed schematic library wrappers.
 * @returns {object[]}
 */
function mergePlanFontDependencies(schematicLibraries) {
    const dependencies = []

    for (const library of schematicLibraries || []) {
        for (const font of library.schematicLibrary?.fonts || []) {
            dependencies.push(
                stripEmpty({
                    libraryFileName: library.fileName || '',
                    id: font?.id,
                    name: font?.name || font?.family || font?.fontFamily
                })
            )
        }
    }

    return dependencies
}

/**
 * Collects symbol rows from library models and optional indexes.
 * @param {object[]} libraries Parsed schematic libraries.
 * @param {object | undefined} libraryIndex Optional mixed library index.
 * @returns {object[]}
 */
function symbolRows(libraries, libraryIndex) {
    const rows = []

    for (const library of libraries || []) {
        for (const [index, symbol] of (
            library.schematicLibrary?.symbols || []
        ).entries()) {
            rows.push({
                libraryFileName: library.fileName || '',
                index,
                name: String(symbol?.name || '').trim(),
                symbol
            })
        }
    }

    for (const item of libraryIndex?.items || []) {
        if (item?.kind !== 'symbol') continue
        rows.push({
            libraryFileName: item.fileName || '',
            index: rows.length,
            name: String(item.name || item.item?.name || '').trim(),
            symbol: item.item || item
        })
    }

    return rows.filter((row) => row.name)
}

/**
 * Collects footprint rows from library models and optional indexes.
 * @param {object[]} libraries Parsed footprint libraries.
 * @param {object | undefined} libraryIndex Optional mixed library index.
 * @returns {object[]}
 */
function footprintRows(libraries, libraryIndex) {
    const rows = []

    for (const library of libraries || []) {
        const libraryName = libraryNameFromFile(library.fileName)
        for (const [index, footprint] of (
            library.pcbLibrary?.footprints || []
        ).entries()) {
            rows.push(
                footprintRow(library.fileName, libraryName, index, footprint)
            )
        }
    }

    for (const item of libraryIndex?.items || []) {
        if (item?.kind !== 'footprint') continue
        rows.push(
            footprintRow(
                item.fileName,
                item.libraryName || '',
                rows.length,
                item.item || item
            )
        )
    }

    return rows.filter((row) => row.name)
}

/**
 * Builds one normalized footprint row.
 * @param {string} fileName Source file name.
 * @param {string} libraryName Footprint library name.
 * @param {number} index Footprint index.
 * @param {object} footprint Footprint model.
 * @returns {object}
 */
function footprintRow(fileName, libraryName, index, footprint) {
    const name = shortFootprintName(
        footprint?.name || footprint?.footprintName || footprint?.libraryName
    )
    return {
        libraryFileName: fileName || '',
        libraryName,
        index,
        name,
        keys: footprintKeys(libraryName, name),
        padCount: (footprint?.pads || []).length,
        models: footprint?.models || footprint?.embeddedModels || [],
        embeddedAssets: footprint?.embeddedAssets || [],
        footprint
    }
}

/**
 * Finds duplicate symbol or footprint names.
 * @param {object[]} rows Library item rows.
 * @param {string} kind Item kind.
 * @returns {object[]}
 */
function duplicatesByName(rows, kind) {
    const byName = new Map()
    for (const row of rows || []) {
        byName.set(row.name, [
            ...(byName.get(row.name) || []),
            {
                libraryFileName: row.libraryFileName,
                index: row.index,
                kind
            }
        ])
    }

    return [...byName.entries()]
        .filter(([, occurrences]) => occurrences.length > 1)
        .map(([name, occurrences]) => ({ name, occurrences }))
        .sort(compareNamed)
}

/**
 * Finds duplicate footprint names and classifies collisions.
 * @param {object[]} footprints Footprint rows.
 * @returns {object[]}
 */
function duplicateFootprintsFor(footprints) {
    return duplicatesByName(footprints, 'footprint').map((entry) => {
        const rows = footprints.filter(
            (footprint) => footprint.name === entry.name
        )
        return {
            ...entry,
            collisionKind:
                new Set(rows.map((footprint) => footprint.padCount)).size > 1
                    ? 'conflicting'
                    : 'duplicate-name'
        }
    })
}

/**
 * Finds symbol footprint properties that do not resolve to a scanned footprint.
 * @param {object[]} symbols Symbol rows.
 * @param {object[]} footprints Footprint rows.
 * @returns {object[]}
 */
function unresolvedFootprintReferencesFor(symbols, footprints) {
    const footprintKeys = new Set(
        footprints.flatMap((footprint) => footprint.keys)
    )
    const unresolved = []

    for (const row of symbols || []) {
        const footprintName = footprintReference(row.symbol)
        if (!footprintName || footprintKeys.has(footprintName)) continue
        unresolved.push({
            libraryFileName: row.libraryFileName,
            symbolName: row.name,
            footprintName
        })
    }

    return unresolved.sort(compareSymbolName)
}

/**
 * Finds model references that do not resolve to available assets.
 * @param {object[]} footprints Footprint rows.
 * @param {Set<string>} availableAssets Available asset paths.
 * @returns {object[]}
 */
function missingModelsFor(footprints, availableAssets) {
    if (availableAssets.size === 0) return []
    const missing = []

    for (const footprint of footprints || []) {
        for (const model of footprint.models || []) {
            const path = String(model?.path || model?.name || '').trim()
            if (!path || availableAssets.has(path)) continue
            missing.push({
                libraryFileName: footprint.libraryFileName,
                footprintName: footprint.name,
                modelPath: path
            })
        }
    }

    return missing.sort(compareFootprintName)
}

/**
 * Finds symbols whose unit ids skip expected unit numbers.
 * @param {object[]} symbols Symbol rows.
 * @returns {object[]}
 */
function unitMismatchesFor(symbols) {
    const mismatches = []

    for (const row of symbols || []) {
        const unitIds = (row.symbol?.units || [])
            .map((unit, index) => Number(unit.unitId ?? index + 1))
            .filter((unitId) => Number.isInteger(unitId) && unitId > 0)
        if (unitIds.length < 2) continue
        const expectedUnitIds = Array.from(
            { length: unitIds.length },
            (_value, index) => index + 1
        )
        if (unitIds.join('\u0000') === expectedUnitIds.join('\u0000')) continue
        mismatches.push({
            libraryFileName: row.libraryFileName,
            symbolName: row.name,
            unitIds,
            expectedUnitIds
        })
    }

    return mismatches.sort(compareSymbolName)
}

/**
 * Returns a symbol footprint reference property.
 * @param {object} symbol Symbol model.
 * @returns {string}
 */
function footprintReference(symbol) {
    const properties = symbol?.properties || {}
    return String(
        properties.Footprint ||
            properties.footprint ||
            properties.FOOTPRINT ||
            symbol?.footprint ||
            ''
    ).trim()
}

/**
 * Builds matching keys for a footprint.
 * @param {string} libraryName Library name.
 * @param {string} name Footprint name.
 * @returns {string[]}
 */
function footprintKeys(libraryName, name) {
    return [
        name,
        libraryName && name ? `${libraryName}:${name}` : '',
        shortFootprintName(name)
    ].filter(Boolean)
}

/**
 * Resolves a library display name from a file name.
 * @param {string | undefined} fileName Source file name.
 * @returns {string}
 */
function libraryNameFromFile(fileName) {
    const base = String(fileName || '')
        .split('/')
        .pop()
        .replace(/\.pretty$/iu, '')
    return base || ''
}

/**
 * Returns the short footprint name after any library prefix.
 * @param {unknown} value Raw footprint name.
 * @returns {string}
 */
function shortFootprintName(value) {
    const text = String(value || '').trim()
    const separator = text.lastIndexOf(':')
    return separator >= 0 ? text.slice(separator + 1) : text
}

/**
 * Counts graphical primitive rows on a schematic library symbol.
 * @param {object} symbol Parsed symbol.
 * @returns {number}
 */
function graphicCount(symbol) {
    if (Array.isArray(symbol?.graphics)) return symbol.graphics.length
    if (!symbol?.graphics || typeof symbol.graphics !== 'object') return 0
    return Object.values(symbol.graphics).reduce(
        (count, records) =>
            count + (Array.isArray(records) ? records.length : 0),
        0
    )
}

/**
 * Removes empty fields from a shallow object.
 * @param {Record<string, unknown>} value Object value.
 * @returns {object}
 */
function stripEmpty(value) {
    return Object.fromEntries(
        Object.entries(value).filter(([, child]) => {
            if (child === undefined || child === null || child === '')
                return false
            if (Array.isArray(child) && child.length === 0) return false
            return true
        })
    )
}

/**
 * Builds a compact issue entry.
 * @param {string} code Diagnostic code.
 * @param {string} target Target name.
 * @returns {object}
 */
function issue(code, target) {
    return { code, severity: 'warning', target }
}

/**
 * Compares named rows.
 * @param {{ name: string }} left Left row.
 * @param {{ name: string }} right Right row.
 * @returns {number}
 */
function compareNamed(left, right) {
    return left.name.localeCompare(right.name)
}

/**
 * Compares rows by symbol name.
 * @param {{ symbolName: string }} left Left row.
 * @param {{ symbolName: string }} right Right row.
 * @returns {number}
 */
function compareSymbolName(left, right) {
    return left.symbolName.localeCompare(right.symbolName)
}

/**
 * Compares rows by footprint name.
 * @param {{ footprintName: string }} left Left row.
 * @param {{ footprintName: string }} right Right row.
 * @returns {number}
 */
function compareFootprintName(left, right) {
    return left.footprintName.localeCompare(right.footprintName)
}
