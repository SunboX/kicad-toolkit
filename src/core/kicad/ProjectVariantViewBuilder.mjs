// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Builds consumer-facing effective views for KiCad project variants.
 */
export class ProjectVariantViewBuilder {
    /**
     * Applies one KiCad project variant to bundle-level collections.
     * @param {object} bundle Project design bundle.
     * @param {{ variantName?: string }} options Variant selection options.
     * @returns {object}
     */
    static build(bundle, options = {}) {
        const variant = findVariant(bundle, options.variantName)
        const dnp = dnpDesignators(bundle, variant)
        const parameterOverrides = variant?.parameterOverrides || {}

        return {
            name: variant?.description || options.variantName || '',
            uniqueId: variant?.uniqueId || '',
            project: bundle?.project || {},
            projectName: bundle?.project?.name || bundle?.summary?.title || '',
            dnp: [...dnp].sort(naturalSort),
            parameterOverrides,
            bom: applyBomVariant(bundle?.bom || [], dnp, parameterOverrides),
            pnp: {
                ...(bundle?.pnp || {}),
                entries: (bundle?.pnp?.entries || []).filter(
                    (entry) => !dnp.has(entry.designator)
                )
            },
            nets: applyNetVariant(bundle?.nets || [], dnp),
            components: (bundle?.components || []).map((component) =>
                applyComponentVariant(component, dnp, parameterOverrides)
            )
        }
    }
}

/**
 * Finds the requested variant or the current project variant.
 * @param {object} bundle Project design bundle.
 * @param {string | undefined} variantName Requested variant.
 * @returns {object | null}
 */
function findVariant(bundle, variantName) {
    const variants = bundle?.variants || bundle?.project?.variants || []
    const requested = String(variantName || '').toLowerCase()
    if (!requested) return variants.find((variant) => variant.isCurrent) || null
    return (
        variants.find((variant) => {
            return (
                String(variant.description || '').toLowerCase() === requested ||
                String(variant.uniqueId || '').toLowerCase() === requested
            )
        }) ||
        variants.find((variant) => variant.isCurrent) ||
        null
    )
}

/**
 * Builds the DNP designator set from explicit variants and KiCad component flags.
 * @param {object} bundle Project design bundle.
 * @param {object | null} variant Variant row.
 * @returns {Set<string>}
 */
function dnpDesignators(bundle, variant) {
    const dnp = new Set((variant?.dnp || []).map(trim).filter(Boolean))
    for (const component of bundle?.components || []) {
        if (component?.doNotPopulate === true || component?.dnp === true) {
            const designator = trim(component.designator)
            if (designator) dnp.add(designator)
        }
    }
    return dnp
}

/**
 * Applies DNP filtering and parameter overrides to BOM rows.
 * @param {object[]} bom BOM rows.
 * @param {Set<string>} dnp DNP designators.
 * @param {Record<string, Record<string, string>>} parameterOverrides Overrides.
 * @returns {object[]}
 */
function applyBomVariant(bom, dnp, parameterOverrides) {
    return (bom || [])
        .flatMap((row) =>
            (row.designators || []).map((designator) =>
                applyBomDesignatorVariant(row, designator, parameterOverrides)
            )
        )
        .filter((row) => !dnp.has(row.designators[0]))
}

/**
 * Applies one designator's parameter overrides to a BOM row.
 * @param {object} row Source BOM row.
 * @param {string} designator Designator.
 * @param {Record<string, Record<string, string>>} parameterOverrides Overrides.
 * @returns {object}
 */
function applyBomDesignatorVariant(row, designator, parameterOverrides) {
    const parameters = parameterOverrides[designator] || {}
    return {
        ...row,
        designators: [designator],
        quantity: 1,
        value: parameters.Value || parameters.Comment || row.value,
        parameters
    }
}

/**
 * Applies DNP filtering to normalized nets.
 * @param {object[]} nets Bundle nets.
 * @param {Set<string>} dnp DNP designators.
 * @returns {object[]}
 */
function applyNetVariant(nets, dnp) {
    return (nets || []).map((net) => {
        const excludedDesignators = []
        const pins = (net.pins || []).filter((pin) => {
            const designator = trim(
                pin.componentDesignator || pin.refdes || pin.ownerDesignator
            )
            if (dnp.has(designator)) {
                excludedDesignators.push(designator)
                return false
            }
            return true
        })

        return {
            ...net,
            pins,
            excludedDesignators: dedupe(excludedDesignators).sort(naturalSort)
        }
    })
}

/**
 * Applies variant flags to one component.
 * @param {object} component Bundle component.
 * @param {Set<string>} dnp DNP designators.
 * @param {Record<string, Record<string, string>>} parameterOverrides Overrides.
 * @returns {object}
 */
function applyComponentVariant(component, dnp, parameterOverrides) {
    return {
        ...component,
        dnp: dnp.has(component.designator),
        parameters: parameterOverrides[component.designator] || {}
    }
}

/**
 * Deduplicates truthy string values.
 * @param {string[]} values Candidate values.
 * @returns {string[]}
 */
function dedupe(values) {
    return [...new Set((values || []).map(trim).filter(Boolean))]
}

/**
 * Trims a value into a string.
 * @param {unknown} value Raw value.
 * @returns {string}
 */
function trim(value) {
    return String(value || '').trim()
}

/**
 * Sorts KiCad designator-like values naturally.
 * @param {string} left First value.
 * @param {string} right Second value.
 * @returns {number}
 */
function naturalSort(left, right) {
    return String(left).localeCompare(String(right), undefined, {
        numeric: true
    })
}
