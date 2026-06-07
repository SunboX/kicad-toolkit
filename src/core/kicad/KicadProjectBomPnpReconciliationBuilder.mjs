// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schemaId = 'kicad-toolkit.project.bom-pnp-reconciliation.a1'

/**
 * Builds deterministic BOM/PnP reconciliation metadata for KiCad projects.
 */
export class KicadProjectBomPnpReconciliationBuilder {
    /**
     * Builds a reconciliation report from a design bundle and parsed documents.
     * @param {{ bundle?: object, documentModels?: object[], effectiveVariant?: object }} [options] Report options.
     * @returns {object}
     */
    static build(options = {}) {
        const bundle = options.bundle || {}
        const documentModels = Array.isArray(options.documentModels)
            ? options.documentModels
            : []
        const schematicBomDesignators = bomDesignators(
            documentModels.filter((model) => model?.kind === 'schematic')
        )
        const pcbBomDesignators = bomDesignators(
            documentModels.filter((model) => model?.kind === 'pcb')
        )
        const pnpDesignators = pnpDesignatorsFor(documentModels)
        const effectiveBomDesignators = effectiveBomDesignatorsFor(
            bundle,
            options.effectiveVariant
        )
        const noBomDesignators = componentFlagDesignators(
            bundle,
            documentModels,
            isNoBomComponent
        )
        const doNotPopulateDesignators = componentFlagDesignators(
            bundle,
            documentModels,
            isDoNotPopulateComponent
        )
        const positionExcludedDesignators = componentFlagDesignators(
            bundle,
            documentModels,
            isPositionExcludedComponent
        )
        const issues = [
            ...missingIssues(
                schematicBomDesignators,
                pcbBomDesignators,
                'reconciliation.schematic-bom-without-pcb-bom',
                'Schematic BOM designator was not present in the PCB-backed BOM.'
            ),
            ...missingIssues(
                pcbBomDesignators,
                schematicBomDesignators,
                'reconciliation.pcb-bom-without-schematic-bom',
                'PCB-backed BOM designator was not present in the schematic BOM.'
            ),
            ...missingIssues(
                pcbBomDesignators,
                pnpDesignators,
                'reconciliation.bom-without-pnp',
                'PCB-backed BOM designator did not have a PnP placement.'
            ),
            ...missingIssues(
                pnpDesignators,
                pcbBomDesignators,
                'reconciliation.pnp-without-bom',
                'PnP placement designator was not present in the PCB-backed BOM.'
            ),
            ...intersectionIssues(
                noBomDesignators,
                pcbBomDesignators,
                'reconciliation.no-bom-component-in-pcb-bom',
                'Component marked exclude-from-BOM appeared in the PCB-backed BOM.'
            ),
            ...intersectionIssues(
                doNotPopulateDesignators,
                effectiveBomDesignators,
                'reconciliation.dnp-component-in-bom',
                'Component marked DNP appeared in the effective BOM.'
            ),
            ...intersectionIssues(
                doNotPopulateDesignators,
                pnpDesignators,
                'reconciliation.dnp-component-in-pnp',
                'Component marked DNP appeared in the PnP placements.'
            ),
            ...intersectionIssues(
                positionExcludedDesignators,
                pnpDesignators,
                'reconciliation.position-excluded-component-in-pnp',
                'Component marked exclude-from-position-files appeared in the PnP placements.'
            )
        ]

        return {
            schema: schemaId,
            summary: {
                schematicBomDesignatorCount: schematicBomDesignators.length,
                pcbBomDesignatorCount: pcbBomDesignators.length,
                pnpDesignatorCount: pnpDesignators.length,
                effectiveBomDesignatorCount: effectiveBomDesignators.length,
                noBomComponentCount: noBomDesignators.length,
                doNotPopulateComponentCount: doNotPopulateDesignators.length,
                positionExcludedComponentCount:
                    positionExcludedDesignators.length,
                issueCount: issues.length
            },
            schematicBomDesignators,
            pcbBomDesignators,
            pnpDesignators,
            effectiveBomDesignators,
            noBomDesignators,
            doNotPopulateDesignators,
            positionExcludedDesignators,
            issues
        }
    }
}

/**
 * Extracts designators from BOM rows.
 * @param {object[]} models Parsed document models.
 * @returns {string[]}
 */
function bomDesignators(models) {
    const designators = new Set()

    for (const model of models || []) {
        for (const row of model?.bom || []) {
            for (const designator of row.designators || []) {
                addDesignator(designators, designator)
            }
            addDesignator(designators, row.designator)
        }
    }

    return sorted([...designators])
}

/**
 * Extracts designators from KiCad pick-place rows.
 * @param {object[]} models Parsed document models.
 * @returns {string[]}
 */
function pnpDesignatorsFor(models) {
    const designators = new Set()

    for (const model of (models || []).filter((item) => item?.kind === 'pcb')) {
        const pnp = model.pnp || model.pcb?.pickPlace || {}
        for (const entry of pnp.entries || []) {
            addDesignator(designators, entry.designator)
        }
    }

    return sorted([...designators])
}

/**
 * Extracts the active effective BOM designators.
 * @param {object} bundle Project design bundle.
 * @param {object | undefined} effectiveVariant Effective variant view.
 * @returns {string[]}
 */
function effectiveBomDesignatorsFor(bundle, effectiveVariant) {
    if (effectiveVariant?.bom)
        return bomDesignators([{ bom: effectiveVariant.bom }])
    if (bundle?.effectiveVariant?.bom) {
        return bomDesignators([{ bom: bundle.effectiveVariant.bom }])
    }
    return bomDesignators([{ bom: bundle?.bom || [] }])
}

/**
 * Extracts component designators matching a predicate.
 * @param {object} bundle Project design bundle.
 * @param {object[]} documentModels Parsed documents.
 * @param {(component: object) => boolean} predicate Component predicate.
 * @returns {string[]}
 */
function componentFlagDesignators(bundle, documentModels, predicate) {
    const designators = new Set()

    for (const component of bundle?.components || []) {
        if (!predicate(component)) continue
        addDesignator(designators, component.designator)
    }

    for (const model of documentModels || []) {
        const components = [
            ...(model.schematic?.components || []),
            ...(model.pcb?.components || [])
        ]
        for (const component of components) {
            if (!predicate(component)) continue
            addDesignator(designators, component.designator)
        }
    }

    return sorted([...designators])
}

/**
 * Returns true when a component is excluded from BOM output.
 * @param {object} component Component row.
 * @returns {boolean}
 */
function isNoBomComponent(component) {
    return (
        component?.excludeFromBom === true ||
        component?.componentKind?.includeInBom === false
    )
}

/**
 * Returns true when a component is DNP.
 * @param {object} component Component row.
 * @returns {boolean}
 */
function isDoNotPopulateComponent(component) {
    return (
        component?.doNotPopulate === true ||
        component?.dnp === true ||
        component?.dns === true
    )
}

/**
 * Returns true when a component is excluded from position files.
 * @param {object} component Component row.
 * @returns {boolean}
 */
function isPositionExcludedComponent(component) {
    return (
        component?.excludeFromPositionFiles === true ||
        component?.componentKind?.includeInPositionFiles === false
    )
}

/**
 * Builds missing-designator issue rows.
 * @param {string[]} source Source designators.
 * @param {string[]} target Target designators.
 * @param {string} code Diagnostic code.
 * @param {string} message Diagnostic message.
 * @returns {object[]}
 */
function missingIssues(source, target, code, message) {
    const targetSet = new Set(target)
    return source
        .filter((designator) => !targetSet.has(designator))
        .map((designator) => issue(code, designator, message))
}

/**
 * Builds issue rows for designators present in both sets.
 * @param {string[]} left Left designators.
 * @param {string[]} right Right designators.
 * @param {string} code Diagnostic code.
 * @param {string} message Diagnostic message.
 * @returns {object[]}
 */
function intersectionIssues(left, right, code, message) {
    const rightSet = new Set(right)
    return left
        .filter((designator) => rightSet.has(designator))
        .map((designator) => issue(code, designator, message))
}

/**
 * Builds a warning issue row.
 * @param {string} code Diagnostic code.
 * @param {string} designator Component designator.
 * @param {string} message Human-readable message.
 * @returns {object}
 */
function issue(code, designator, message) {
    return { severity: 'warning', code, designator, message }
}

/**
 * Adds a normalized designator to a set.
 * @param {Set<string>} designators Target set.
 * @param {unknown} value Raw designator value.
 * @returns {void}
 */
function addDesignator(designators, value) {
    const designator = String(value || '').trim()
    if (designator) designators.add(designator)
}

/**
 * Sorts designators in a stable human-friendly order.
 * @param {string[]} values Designator values.
 * @returns {string[]}
 */
function sorted(values) {
    return [...values].sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true })
    )
}
